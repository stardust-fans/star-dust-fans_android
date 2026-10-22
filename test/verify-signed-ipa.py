#!/usr/bin/env python3
"""Independently verify a central iOS signing response and its downloaded archives."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import plistlib
import re
import shutil
import stat
import struct
import subprocess
import sys
import tempfile
import unicodedata
import uuid
import zipfile
from pathlib import Path

MAX_ARCHIVE_BYTES = 1_000_000_000
MAX_UNPACKED_BYTES = 4_000_000_000
MAX_JSON_BYTES = 1_048_576
MAX_PLIST_BYTES = 8_388_608
IOS_REPORT_FIELDS = {
    "schema_version", "request_id", "generation", "stage", "input_digest", "recipe_sha",
    "policy_digest", "source_sha", "version", "architecture", "team_id", "bundle_id",
    "codesign_verified", "identity_class", "certificate_expiration", "profile_uuid",
    "profile_expiration", "profile_type", "authorized_device_count", "files",
}
SOURCE_FIELDS = {"platform", "architecture", "bundle_id", "version", "source_sha"}
HEX_SHA256 = re.compile(r"^[0-9a-f]{64}$")
HEX_COMMIT = re.compile(r"^[0-9a-f]{40}$")
VERSION = re.compile(r"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$")
TEAM_ID = re.compile(r"^[A-Z0-9]{10}$")
UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")


class VerificationError(Exception):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise VerificationError(message)


def read_regular_file(path: Path, limit: int) -> bytes:
    try:
        info = path.lstat()
    except OSError as exc:
        raise VerificationError("An input file is missing or unreadable.") from exc
    require(stat.S_ISREG(info.st_mode), "Inputs must be regular files.")
    require(info.st_size <= limit, "An input file exceeds its allowed size.")
    try:
        return path.read_bytes()
    except OSError as exc:
        raise VerificationError("An input file is missing or unreadable.") from exc


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as stream:
            while chunk := stream.read(1024 * 1024):
                digest.update(chunk)
    except OSError as exc:
        raise VerificationError("An input file is missing or unreadable.") from exc
    return digest.hexdigest()


def validate_zip_infos(archive: zipfile.ZipFile, *, max_total: int, allowed_roots: set[str] | None = None) -> list[zipfile.ZipInfo]:
    entries = archive.infolist()
    require(len(entries) <= 100_000, "An archive has too many entries.")
    names: set[str] = set()
    folded: set[str] = set()
    total = 0
    files: list[zipfile.ZipInfo] = []
    for entry in entries:
        name = entry.filename
        directory = entry.is_dir()
        plain = name[:-1] if directory else name
        parts = plain.split("/")
        require(bool(plain) and not name.startswith("/") and "\\" not in name and ":" not in name,
                "An archive contains an unsafe path.")
        require(all(part not in ("", ".", "..") for part in parts), "An archive contains an unsafe path.")
        normalized = unicodedata.normalize("NFC", plain).casefold()
        require(name not in names and normalized not in folded, "An archive contains duplicate paths.")
        names.add(name)
        folded.add(normalized)
        require(not entry.flag_bits & 1, "Encrypted archive entries are not supported.")
        mode = (entry.external_attr >> 16) & 0xFFFF
        kind = stat.S_IFMT(mode)
        require(kind in (0, stat.S_IFREG, stat.S_IFDIR), "An archive contains a non-regular entry.")
        require((directory and kind in (0, stat.S_IFDIR)) or (not directory and kind in (0, stat.S_IFREG)),
                "An archive entry has an inconsistent type.")
        total += entry.file_size
        require(total <= max_total, "An archive exceeds its unpacked size limit.")
        if allowed_roots is not None:
            require(parts[0] in allowed_roots, "An archive contains an unexpected root entry.")
        if not directory:
            files.append(entry)
    return files


def open_zip(path: Path, *, max_bytes: int) -> zipfile.ZipFile:
    try:
        info = path.lstat()
        require(stat.S_ISREG(info.st_mode) and info.st_size <= max_bytes, "An archive input is invalid or too large.")
        return zipfile.ZipFile(path, "r")
    except (OSError, zipfile.BadZipFile) as exc:
        raise VerificationError("An archive is unreadable or invalid.") from exc


def exact_files(files: list[zipfile.ZipInfo], expected: set[str], message: str) -> dict[str, zipfile.ZipInfo]:
    by_name = {entry.filename: entry for entry in files}
    require(set(by_name) == expected, message)
    return by_name


def read_zip_member(archive: zipfile.ZipFile, entry: zipfile.ZipInfo, limit: int) -> bytes:
    require(entry.file_size <= limit, "An archive metadata file exceeds its size limit.")
    try:
        with archive.open(entry, "r") as stream:
            data = stream.read(limit + 1)
    except (OSError, RuntimeError, zipfile.BadZipFile) as exc:
        raise VerificationError("An archive entry could not be verified.") from exc
    require(len(data) == entry.file_size and len(data) <= limit, "An archive entry has an invalid size.")
    return data


def parse_json(data: bytes, message: str) -> dict:
    try:
        value = json.loads(data)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise VerificationError(message) from exc
    require(isinstance(value, dict), message)
    return value


def parse_datetime(value: object, message: str) -> dt.datetime:
    require(isinstance(value, str), message)
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise VerificationError(message) from exc
    require(parsed.tzinfo is not None and parsed.utcoffset() is not None, message)
    return parsed.astimezone(dt.timezone.utc)


def validate_report(report: dict, request_id: str, recipe_sha: str, team_id: str, bundle_id: str) -> dict:
    require(set(report) == IOS_REPORT_FIELDS, "The signing report has unexpected or missing fields.")
    try:
        uuid.UUID(report["request_id"])
    except (ValueError, TypeError, AttributeError) as exc:
        raise VerificationError("The signing report has an invalid request identifier.") from exc
    require(report["request_id"] == request_id, "The signing report does not match the requested job.")
    require(report["schema_version"] == 1 and type(report["generation"]) is int and report["generation"] > 0,
            "The signing report has an invalid schema or generation.")
    require(report["stage"] == "ios_sign", "The report is not an iOS signing result.")
    require(re.fullmatch(r"sha256:[0-9a-f]{64}", str(report["input_digest"])) is not None,
            "The source archive digest is invalid.")
    require(HEX_COMMIT.fullmatch(str(report["recipe_sha"])) is not None and report["recipe_sha"] == recipe_sha,
            "The recipe commit does not match the expected value.")
    require(re.fullmatch(r"sha256:[0-9a-f]{64}", str(report["policy_digest"])) is not None,
            "The signing policy digest is invalid.")
    require(HEX_COMMIT.fullmatch(str(report["source_sha"])) is not None, "The source commit is invalid.")
    require(isinstance(report["version"], str) and len(report["version"]) <= 64 and VERSION.fullmatch(report["version"]) is not None,
            "The application version is invalid.")
    require(report["architecture"] == "arm64" and report["team_id"] == team_id and report["bundle_id"] == bundle_id,
            "The report app identity does not match the expected values.")
    require(TEAM_ID.fullmatch(str(report["team_id"])) is not None and isinstance(report["bundle_id"], str),
            "The report app identity is malformed.")
    require(report["codesign_verified"] is True and report["identity_class"] == "Apple Development",
            "The trusted runner did not attest an Apple Development signature.")
    require(report["profile_type"] == "development" and UUID_RE.fullmatch(str(report["profile_uuid"])) is not None,
            "The provisioning profile identity is invalid.")
    require(type(report["authorized_device_count"]) is int and 1 <= report["authorized_device_count"] <= 100_000,
            "The profile device count is invalid.")
    now = dt.datetime.now(dt.timezone.utc)
    cert_exp = parse_datetime(report["certificate_expiration"], "The certificate expiration is invalid.")
    profile_exp = parse_datetime(report["profile_expiration"], "The profile expiration is invalid.")
    require(cert_exp > now and profile_exp > now, "The signing certificate or provisioning profile has expired.")
    files = report["files"]
    require(isinstance(files, list) and len(files) == 1 and isinstance(files[0], dict)
            and set(files[0]) == {"path", "size", "sha256"}, "The report must describe exactly one IPA file.")
    record = files[0]
    require(record["path"] == "signed.ipa" and type(record["size"]) is int and 0 < record["size"] <= MAX_ARCHIVE_BYTES
            and isinstance(record["sha256"], str) and HEX_SHA256.fullmatch(record["sha256"]) is not None,
            "The signed IPA record is invalid.")
    return report


def plist_load(data: bytes, message: str) -> dict:
    require(len(data) <= MAX_PLIST_BYTES, "A property list exceeds its size limit.")
    try:
        value = plistlib.loads(data)
    except (plistlib.InvalidFileException, ValueError, TypeError) as exc:
        raise VerificationError(message) from exc
    require(isinstance(value, dict), message)
    return value


def validate_macho_stream(stream, file_size: int) -> None:
    require(file_size >= 32, "The app executable is not a valid 64-bit Mach-O image.")
    stream.seek(0)
    raw_magic = stream.read(4)
    if raw_magic == b"\xcf\xfa\xed\xfe":
        endian = "<"
    elif raw_magic == b"\xfe\xed\xfa\xcf":
        endian = ">"
    else:
        raise VerificationError("The app executable must be a thin 64-bit Mach-O image.")
    stream.seek(0)
    header_data = stream.read(32)
    require(len(header_data) == 32, "The app executable header is truncated.")
    header = struct.unpack(endian + "IiiIIIII", header_data)
    require(header[1] == 0x0100000C, "The app executable is not arm64.")
    command_count, command_bytes = header[4], header[5]
    require(command_count <= 4096 and command_bytes <= 16_777_216 and 32 + command_bytes <= file_size,
            "The Mach-O load commands are invalid.")
    offset = 32
    platforms: list[int] = []
    for _ in range(command_count):
        require(offset + 8 <= 32 + command_bytes, "The Mach-O load commands are truncated.")
        command_bytes_header = stream.read(8)
        require(len(command_bytes_header) == 8, "The Mach-O load commands are truncated.")
        command, command_size = struct.unpack(endian + "II", command_bytes_header)
        require(command_size >= 8 and offset + command_size <= 32 + command_bytes,
                "The Mach-O load command size is invalid.")
        if command & 0x7FFFFFFF == 0x32:
            require(command_size >= 24, "The Mach-O build-version command is truncated.")
            command_payload = stream.read(command_size - 8)
            require(len(command_payload) == command_size - 8, "The Mach-O build-version command is truncated.")
            platforms.append(struct.unpack_from(endian + "I", command_payload, 0)[0])
        else:
            stream.seek(command_size - 8, os.SEEK_CUR)
        offset += command_size
    require(offset == 32 + command_bytes and platforms and all(platform == 2 for platform in platforms),
            "The executable must target iOS and must not target the simulator.")


def validate_macho(binary: bytes) -> None:
    from io import BytesIO
    validate_macho_stream(BytesIO(binary), len(binary))


def safe_component(value: object) -> str:
    require(isinstance(value, str) and value not in ("", ".", "..") and "/" not in value and "\\" not in value,
            "The app executable path is invalid.")
    return value


def application_info(files: dict[str, zipfile.ZipInfo], archive: zipfile.ZipFile, app_root: str) -> dict:
    info_path = f"{app_root}/Info.plist"
    require(info_path in files, "The app Info.plist is missing.")
    info = plist_load(read_zip_member(archive, files[info_path], MAX_PLIST_BYTES), "The app Info.plist is invalid.")
    executable = safe_component(info.get("CFBundleExecutable"))
    executable_path = f"{app_root}/{executable}"
    require(executable_path in files, "The app executable is missing.")
    executable_entry = files[executable_path]
    with archive.open(executable_entry, "r") as executable_stream:
        validate_macho_stream(executable_stream, executable_entry.file_size)
    return info


def verify_source_artifact(path: Path, report: dict, bundle_id: str, temp_dir: Path) -> dict:
    with open_zip(path, max_bytes=MAX_ARCHIVE_BYTES) as outer:
        require(sha256_file(path) == report["input_digest"].removeprefix("sha256:"),
                "The downloaded source artifact digest does not match the signing report.")
        outer_files = validate_zip_infos(outer, max_total=MAX_ARCHIVE_BYTES)
        members = exact_files(outer_files, {"unsigned.xcarchive.zip", "source.json"},
                              "The source artifact must contain exactly the expected two files.")
        source = parse_json(read_zip_member(outer, members["source.json"], MAX_JSON_BYTES),
                            "The source metadata JSON is invalid.")
        require(set(source) == SOURCE_FIELDS and source == {
            "platform": "ios", "architecture": "arm64", "bundle_id": bundle_id,
            "version": report["version"], "source_sha": report["source_sha"],
        }, "The source metadata does not match the signed report.")
        inner_path = temp_dir / "unsigned.xcarchive.zip"
        try:
            with outer.open(members["unsigned.xcarchive.zip"], "r") as source_stream, inner_path.open("xb") as destination:
                shutil.copyfileobj(source_stream, destination, 1024 * 1024)
        except (OSError, RuntimeError, zipfile.BadZipFile) as exc:
            raise VerificationError("The nested source archive could not be read.") from exc
        require(inner_path.stat().st_size == members["unsigned.xcarchive.zip"].file_size,
                "The nested source archive size is invalid.")
    with open_zip(inner_path, max_bytes=MAX_ARCHIVE_BYTES) as inner:
        inner_files = validate_zip_infos(inner, max_total=MAX_UNPACKED_BYTES)
        require(inner.testzip() is None, "The source archive contains a corrupt ZIP member.")
        infos = [entry for entry in inner.infolist() if entry.filename == "unsigned.xcarchive/Info.plist"]
        require(len(infos) == 1, "The source archive root is missing its Info.plist.")
        require(all(entry.filename.startswith("unsigned.xcarchive/") for entry in inner.infolist()),
                "The source archive contains an unexpected root.")
        archive_info = plist_load(read_zip_member(inner, infos[0], MAX_PLIST_BYTES),
                                  "The source archive Info.plist is invalid.")
        properties = archive_info.get("ApplicationProperties")
        require(isinstance(properties, dict), "The source archive application metadata is invalid.")
        relative = properties.get("ApplicationPath")
        require(isinstance(relative, str) and re.fullmatch(r"Applications/[^/]+\.app", relative) is not None,
                "The source archive application path is invalid.")
        root_names = {entry.filename.removeprefix("unsigned.xcarchive/").split("/", 1)[0]
                      for entry in inner.infolist() if entry.filename != "unsigned.xcarchive/"}
        require({"Info.plist", "Products"}.issubset(root_names)
                and root_names.issubset({"Info.plist", "Products", "dSYMs", "BCSymbolMaps", "SwiftSupport"}),
                "The source archive root layout is invalid.")
        product_children = {entry.filename.removeprefix("unsigned.xcarchive/Products/").split("/", 1)[0]
                            for entry in inner.infolist()
                            if entry.filename.startswith("unsigned.xcarchive/Products/")
                            and entry.filename != "unsigned.xcarchive/Products/"}
        require(product_children == {"Applications"}, "The source archive Products layout is invalid.")
        apps = [name for name in {entry.filename for entry in inner_files}
                if name.startswith("unsigned.xcarchive/Products/Applications/") and name.endswith(".app/Info.plist")]
        require(len(apps) == 1, "The source archive must contain exactly one app bundle.")
        app_root = apps[0][:-len("/Info.plist")]
        expected_root = f"unsigned.xcarchive/Products/{relative}"
        require(app_root == expected_root, "The source archive app path does not match its archive metadata.")
        app_children = {entry.filename.removeprefix("unsigned.xcarchive/Products/Applications/").split("/", 1)[0]
                        for entry in inner.infolist()
                        if entry.filename.startswith("unsigned.xcarchive/Products/Applications/")
                        and entry.filename != "unsigned.xcarchive/Products/Applications/"}
        require(app_children == {app_root.rsplit("/", 1)[-1]}, "The source archive must contain only its declared app bundle.")
        app_info = application_info({entry.filename: entry for entry in inner_files}, inner, app_root)
        require(app_info.get("CFBundleIdentifier") == bundle_id and app_info.get("CFBundleShortVersionString") == report["version"],
                "The unsigned source app identity does not match the signed report.")
        require(properties.get("CFBundleIdentifier") == bundle_id
                and properties.get("CFBundleShortVersionString") == report["version"],
                "The source archive metadata does not match the signed report.")
        require(not (isinstance(properties.get("SigningIdentity"), str)
                     and "Developer ID" in properties["SigningIdentity"]),
                "The source archive unexpectedly has a Developer ID signing identity.")
        require(f"{app_root}/embedded.mobileprovision" not in {entry.filename for entry in inner_files},
                "The unsigned source app unexpectedly contains a provisioning profile.")
    return source


def extract_output_ipa(path: Path, status: dict, report: dict, temp_dir: Path) -> Path:
    output = status["output"]
    require(isinstance(output, dict), "The request status has no output record.")
    with open_zip(path, max_bytes=MAX_ARCHIVE_BYTES) as archive:
        require(type(output.get("archive_size")) is int and output["archive_size"] == path.stat().st_size
                and re.fullmatch(r"sha256:[0-9a-f]{64}", str(output.get("archive_digest", ""))) is not None
                and output["archive_digest"].removeprefix("sha256:") == sha256_file(path),
                "The downloaded output ZIP does not match the central archive digest and size.")
        files = validate_zip_infos(archive, max_total=MAX_ARCHIVE_BYTES)
        members = exact_files(files, {"signed.ipa", "verification.json"},
                              "The signed output ZIP must contain exactly signed.ipa and verification.json.")
        embedded_report = parse_json(read_zip_member(archive, members["verification.json"], MAX_JSON_BYTES),
                                     "The embedded signing report is invalid.")
        require(embedded_report == report, "The ZIP report does not exactly match the central status report.")
        ipa_entry = members["signed.ipa"]
        ipa_size = report["files"][0]["size"]
        require(ipa_entry.file_size == ipa_size, "The IPA ZIP entry size does not match its report.")
        ipa_path = temp_dir / "signed.ipa"
        digest = hashlib.sha256()
        written = 0
        try:
            with archive.open(ipa_entry, "r") as source, ipa_path.open("xb") as destination:
                while chunk := source.read(1024 * 1024):
                    written += len(chunk)
                    require(written <= ipa_size, "The IPA entry exceeds its declared size.")
                    digest.update(chunk)
                    destination.write(chunk)
        except (OSError, RuntimeError, zipfile.BadZipFile) as exc:
            raise VerificationError("The signed IPA could not be read.") from exc
        require(written == ipa_size and digest.hexdigest() == report["files"][0]["sha256"],
                "The IPA bytes do not match the report size and SHA-256.")
    return ipa_path


def run_openssl(openssl: str, args: list[str], message: str, timeout: int = 30) -> subprocess.CompletedProcess:
    try:
        env = os.environ.copy()
        if os.name == "nt":
            env.setdefault("OPENSSL_CONF", "NUL")
        result = subprocess.run([openssl, *args], capture_output=True, check=False, timeout=timeout, env=env)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise VerificationError(message) from exc
    require(result.returncode == 0, message)
    return result


def decode_profile(profile_bytes: bytes, temp_dir: Path, name: str, openssl: str) -> dict:
    cms_path = temp_dir / f"{name}.mobileprovision"
    plist_path = temp_dir / f"{name}.plist"
    cms_path.write_bytes(profile_bytes)
    run_openssl(openssl, ["cms", "-verify", "-inform", "DER", "-in", str(cms_path), "-noverify", "-out", str(plist_path)],
                "The provisioning profile CMS signature could not be verified.")
    try:
        return plist_load(plist_path.read_bytes(), "The signed provisioning profile payload is invalid.")
    except OSError as exc:
        raise VerificationError("The signed provisioning profile payload is unavailable.") from exc


def openssl_certificate_info(certificate: bytes, temp_dir: Path, openssl: str) -> tuple[dt.datetime, str]:
    cert_path = temp_dir / "profile-developer-cert.der"
    cert_path.write_bytes(certificate)
    result = run_openssl(openssl, ["x509", "-inform", "DER", "-in", str(cert_path), "-noout", "-enddate", "-subject", "-nameopt", "RFC2253"],
                         "The provisioning profile developer certificate is invalid.")
    text = result.stdout.decode("utf-8", errors="strict")
    expiry_line = next((line.removeprefix("notAfter=") for line in text.splitlines() if line.startswith("notAfter=")), None)
    subject = next((line.removeprefix("subject=") for line in text.splitlines() if line.startswith("subject=")), "")
    require(expiry_line is not None, "The provisioning profile certificate expiration is missing.")
    try:
        expiration = dt.datetime.strptime(expiry_line.strip(), "%b %d %H:%M:%S %Y GMT").replace(tzinfo=dt.timezone.utc)
    except ValueError as exc:
        raise VerificationError("The provisioning profile certificate expiration is invalid.") from exc
    return expiration, subject


def validate_profile(profile: dict, report: dict, team_id: str, bundle_id: str, temp_dir: Path, openssl: str,
                     phone_record: dict | None = None, label: str = "embedded") -> bytes:
    profile_uuid = profile.get("UUID")
    require(isinstance(profile_uuid, str) and UUID_RE.fullmatch(profile_uuid) is not None
            and profile_uuid.lower() == report["profile_uuid"].lower(),
            f"The {label} profile UUID does not match the report.")
    require(profile.get("TeamIdentifier") == [team_id], f"The {label} profile team does not match the expected team.")
    prefixes = profile.get("ApplicationIdentifierPrefix")
    require(isinstance(prefixes, list) and prefixes and all(isinstance(item, str) and TEAM_ID.fullmatch(item) for item in prefixes),
            f"The {label} profile application prefix is invalid.")
    entitlements = profile.get("Entitlements")
    app_id = entitlements.get("application-identifier") if isinstance(entitlements, dict) else None
    require(isinstance(app_id, str) and any(re.fullmatch(re.escape(app_id).replace(r"\*", ".*"), f"{prefix}.{bundle_id}")
                                              for prefix in prefixes),
            f"The {label} profile does not authorize the expected app identifier.")
    require(entitlements.get("get-task-allow") is True and profile.get("ProvisionsAllDevices") is not True,
            f"The {label} profile is not a development profile.")
    devices = profile.get("ProvisionedDevices")
    device_pattern = re.compile(r"^(?:[A-Fa-f0-9]{40}|[A-Fa-f0-9]{8}-[A-Fa-f0-9]{16})$")
    require(isinstance(devices, list) and len(devices) == report["authorized_device_count"]
            and all(isinstance(item, str) and device_pattern.fullmatch(item) for item in devices),
            f"The {label} profile device count does not match the report.")
    profile_exp = profile.get("ExpirationDate")
    require(isinstance(profile_exp, dt.datetime), f"The {label} profile expiration is invalid.")
    if profile_exp.tzinfo is None:
        profile_exp = profile_exp.replace(tzinfo=dt.timezone.utc)
    require(abs((profile_exp.astimezone(dt.timezone.utc) - parse_datetime(report["profile_expiration"], "The report profile expiration is invalid.")).total_seconds()) <= 1,
            f"The {label} profile expiration does not match the report.")
    certificates = profile.get("DeveloperCertificates")
    require(isinstance(certificates, list) and len(certificates) == 1 and isinstance(certificates[0], bytes),
            f"The {label} profile must contain exactly one developer certificate.")
    cert = certificates[0]
    cert_exp, subject = openssl_certificate_info(cert, temp_dir, openssl)
    require(f"OU={team_id}" in subject and "CN=Apple Development:" in subject,
            f"The {label} profile certificate is not an Apple Development identity for the expected team.")
    require(abs((cert_exp - parse_datetime(report["certificate_expiration"], "The report certificate expiration is invalid.")).total_seconds()) <= 1,
            f"The {label} profile certificate expiration does not match the report.")
    if phone_record is not None:
        udid = phone_record.get("udid")
        require(phone_record.get("device_type") == "iPhone" and phone_record.get("connection_type") == "USB"
                and isinstance(udid, str) and udid in devices,
                f"The {label} profile does not include the privately registered iPhone.")
    return cert


def validate_ipa(ipa_path: Path, report: dict, team_id: str, bundle_id: str, temp_dir: Path, openssl: str,
                 local_profile_path: Path | None, phone_record_path: Path | None) -> str:
    with open_zip(ipa_path, max_bytes=MAX_ARCHIVE_BYTES) as ipa:
        files = validate_zip_infos(ipa, max_total=MAX_UNPACKED_BYTES, allowed_roots={"Payload", "SwiftSupport", "Symbols"})
        require(ipa.testzip() is None, "The signed IPA contains a corrupt ZIP member.")
        file_map = {entry.filename: entry for entry in files}
        app_infos = [name for name in file_map if name.startswith("Payload/") and name.count("/") == 2 and name.endswith(".app/Info.plist")]
        require(len(app_infos) == 1, "The signed IPA must contain exactly one app bundle.")
        app_root = app_infos[0][:-len("/Info.plist")]
        app_info = application_info(file_map, ipa, app_root)
        require(app_info.get("CFBundleIdentifier") == bundle_id and app_info.get("CFBundleShortVersionString") == report["version"],
                "The signed app bundle identifier or version does not match the report.")
        profile_path = f"{app_root}/embedded.mobileprovision"
        require(profile_path in file_map, "The signed app has no embedded provisioning profile.")
        embedded_bytes = read_zip_member(ipa, file_map[profile_path], 2_000_000)
    phone_record = None
    if phone_record_path is not None:
        phone_record = parse_json(read_regular_file(phone_record_path, MAX_JSON_BYTES), "The connected-device record is invalid.")
    embedded_profile = decode_profile(embedded_bytes, temp_dir, "embedded-profile", openssl)
    embedded_cert = validate_profile(embedded_profile, report, team_id, bundle_id, temp_dir, openssl, phone_record)
    if local_profile_path is not None:
        local_bytes = read_regular_file(local_profile_path, 2_000_000)
        local_profile = decode_profile(local_bytes, temp_dir, "local-profile", openssl)
        local_cert = validate_profile(local_profile, report, team_id, bundle_id, temp_dir, openssl, phone_record, "local")
        require(local_cert == embedded_cert and local_profile.get("UUID") == embedded_profile.get("UUID"),
                "The supplied local profile does not match the IPA profile.")
    return app_info["CFBundleShortVersionString"]


def verify(status_path: Path, output_path: Path, source_path: Path, recipe_sha: str, team_id: str, bundle_id: str,
           local_profile_path: Path | None = None, phone_record_path: Path | None = None, openssl: str = "openssl") -> dict:
    require(HEX_COMMIT.fullmatch(recipe_sha) is not None, "The expected recipe SHA must be a 40-character lowercase commit hash.")
    require(TEAM_ID.fullmatch(team_id) is not None, "The expected team ID must contain ten uppercase letters or digits.")
    require(isinstance(bundle_id, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.-]{0,254}", bundle_id) is not None,
            "The expected bundle ID is invalid.")
    status = parse_json(read_regular_file(status_path, MAX_JSON_BYTES), "The request status JSON is invalid.")
    require(status.get("state") == "succeeded", "The signing request has not succeeded.")
    request_id = status.get("request_id")
    try:
        request_id = str(uuid.UUID(request_id))
    except (ValueError, TypeError, AttributeError) as exc:
        raise VerificationError("The request status has an invalid identifier.") from exc
    report = status.get("output", {}).get("report") if isinstance(status.get("output"), dict) else None
    require(isinstance(report, dict), "The request status does not include a signing report.")
    validate_report(report, request_id, recipe_sha, team_id, bundle_id)
    with tempfile.TemporaryDirectory(prefix="verify-signed-ipa-") as temp_name:
        temp_dir = Path(temp_name)
        source = verify_source_artifact(source_path, report, bundle_id, temp_dir)
        require(status.get("platform") == "ios", "The request status is not for iOS.")
        require(status.get("source_sha") == source["source_sha"] == report["source_sha"],
                "The source commit does not match request status.")
        require(status.get("version") == source["version"] == report["version"],
                "The app version does not match request status.")
        require(status.get("input_digest") == report["input_digest"],
                "The source archive digest does not match request status.")
        ipa_path = extract_output_ipa(output_path, status, report, temp_dir)
        version = validate_ipa(ipa_path, report, team_id, bundle_id, temp_dir, openssl,
                               local_profile_path, phone_record_path)
        return {"output_sha256": sha256_file(output_path), "output_size": output_path.stat().st_size,
                "ipa_sha256": report["files"][0]["sha256"], "ipa_size": report["files"][0]["size"],
                "bundle_id": bundle_id, "version": version, "profile_uuid": report["profile_uuid"],
                "authorized_device_count": report["authorized_device_count"]}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify a signed iOS IPA against central signing status and its source artifact.")
    parser.add_argument("--status", required=True, type=Path,
                        help="One central status object for this request; select its item from an admin/status array if needed")
    parser.add_argument("--signed-zip", required=True, type=Path, help="Downloaded central output ZIP")
    parser.add_argument("--source-artifact", required=True, type=Path, help="Completed unsigned-ios-archive GitHub artifact ZIP")
    parser.add_argument("--recipe-sha", required=True)
    parser.add_argument("--team-id", required=True)
    parser.add_argument("--bundle-id", required=True)
    parser.add_argument("--profile", type=Path, help="Optional local provisioning profile for cross-checking")
    parser.add_argument("--phone-record", type=Path, help="Optional connected-iphone.json for private membership check")
    parser.add_argument("--receipt-output", type=Path, help="Write a sanitized verification receipt after all checks pass")
    parser.add_argument("--quiet", action="store_true", help="Suppress verification details from standard output")
    parser.add_argument("--openssl", default="openssl", help="OpenSSL executable")
    args = parser.parse_args(argv)
    try:
        result = verify(args.status, args.signed_zip, args.source_artifact, args.recipe_sha, args.team_id,
                        args.bundle_id, args.profile, args.phone_record, args.openssl)
    except VerificationError as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    if not args.quiet:
        print(f"Output ZIP SHA-256: {result['output_sha256']} ({result['output_size']} bytes)")
        print(f"IPA SHA-256: {result['ipa_sha256']} ({result['ipa_size']} bytes)")
        print(f"Bundle/version: {result['bundle_id']} / {result['version']}")
        print(f"Profile UUID/device count: {result['profile_uuid']} / {result['authorized_device_count']}")
        print("Result: PASS")
        print("CMS signature integrity was checked; certificate-chain trust and Mach-O code-signature validation are attested by the trusted signing runner.")
    if args.receipt_output is not None:
        status = parse_json(read_regular_file(args.status, MAX_JSON_BYTES), "The request status JSON is invalid.")
        receipt = {
            "request_id": status["request_id"],
            "source_sha": status["source_sha"],
            "bundle_id": result["bundle_id"],
            "version": result["version"],
            "output_sha256": result["output_sha256"],
            "output_size": result["output_size"],
            "ipa_sha256": result["ipa_sha256"],
            "ipa_size": result["ipa_size"],
            "verification": "passed",
        }
        require(not args.receipt_output.exists(), "The verification receipt path already exists.")
        args.receipt_output.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
