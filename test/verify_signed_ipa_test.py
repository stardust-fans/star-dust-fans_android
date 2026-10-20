import datetime as dt
import hashlib
import importlib.util
import json
import plistlib
import shutil
import struct
import subprocess
import tempfile
import unittest
import uuid
import zipfile
from pathlib import Path


SCRIPT = Path(__file__).with_name("verify-signed-ipa.py")
SPEC = importlib.util.spec_from_file_location("verify_signed_ipa", SCRIPT)
VERIFY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFY)
OPENSSL = shutil.which("openssl")


def macho(platform=2, cpu=0x0100000C):
    header = struct.pack("<IiiIIIII", 0xFEEDFACF, cpu, 0, 2, 1, 24, 0, 0)
    command = struct.pack("<IIIIII", 0x32, 24, platform, 0x10000, 0x10000, 0)
    return header + command


@unittest.skipUnless(OPENSSL, "OpenSSL is required to generate signed profile fixtures")
class SignedIpaVerificationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture_root = tempfile.TemporaryDirectory(prefix="signed-ipa-test-")
        cls.root = Path(cls.fixture_root.name)
        cls.team = "A1B2C3D4E5"
        cls.bundle = "top.example.mobile"
        cls.version = "1.3.0"
        cls.source_sha = "a" * 40
        cls.recipe_sha = "b" * 40
        cls.request_id = str(uuid.uuid4())
        cls.device_id = "A1B2C3D4-0123456789ABCDEF"
        cls.cert = cls.root / "fixture-cert.pem"
        cls.key = cls.root / "fixture-private-key.pem"
        cls.cert_der = cls.root / "fixture-cert.der"
        cls.openssl( "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", str(cls.key), "-out", str(cls.cert),
                     "-days", "365", "-subj", f"/CN=Apple Development: Fixture/OU={cls.team}")
        cls.openssl("x509", "-in", str(cls.cert), "-outform", "DER", "-out", str(cls.cert_der))
        cls.certificate_expiration, _ = VERIFY.openssl_certificate_info(cls.cert_der.read_bytes(), cls.root, OPENSSL)
        cls.profile_expiration = dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=60)
        cls.profile_plist = {
            "UUID": str(uuid.uuid4()), "TeamIdentifier": [cls.team], "ApplicationIdentifierPrefix": [cls.team],
            "ExpirationDate": cls.profile_expiration, "ProvisionsAllDevices": False,
            "ProvisionedDevices": [cls.device_id], "DeveloperCertificates": [cls.cert_der.read_bytes()],
            "Entitlements": {"application-identifier": f"{cls.team}.{cls.bundle}", "get-task-allow": True,
                             "com.apple.developer.team-identifier": cls.team},
        }
        payload = cls.root / "profile.plist"
        payload.write_bytes(plistlib.dumps(cls.profile_plist, fmt=plistlib.FMT_XML))
        cls.profile = cls.root / "development.mobileprovision"
        cls.openssl("cms", "-sign", "-binary", "-in", str(payload), "-signer", str(cls.cert), "-inkey", str(cls.key),
                    "-outform", "DER", "-out", str(cls.profile), "-nosmimecap", "-nodetach")

    @classmethod
    def tearDownClass(cls):
        cls.fixture_root.cleanup()

    @classmethod
    def openssl(cls, *args):
        import os
        env = os.environ.copy()
        if os.name == "nt":
            env.setdefault("OPENSSL_CONF", "NUL")
        result = subprocess.run([OPENSSL, *args], capture_output=True, check=False, env=env)
        if result.returncode:
            raise RuntimeError("fixture generation failed")

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="signed-ipa-case-")
        self.root = Path(self.temp.name)
        self.source = self.root / "source.zip"
        self.output = self.root / "signed-output.zip"
        self.status = self.root / "status.json"
        self.local_profile = self.root / "local.mobileprovision"
        self.local_profile.write_bytes(self.profile.read_bytes())
        self.phone_record = self.root / "connected-iphone.json"
        self.phone_record.write_text(json.dumps({"device_type": "iPhone", "connection_type": "USB", "udid": self.device_id}), encoding="utf-8")
        self.ipa = self.make_ipa(self.profile.read_bytes())
        self.make_source()
        self.report = self.make_report()
        self.make_output(self.ipa)
        self.make_status(self.report)

    def tearDown(self):
        self.temp.cleanup()

    def make_ipa(self, profile):
        path = self.root / "signed.ipa"
        app = "Payload/StarDust.app"
        info = {"CFBundleIdentifier": self.bundle, "CFBundleShortVersionString": self.version, "CFBundleExecutable": "StarDust"}
        with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_STORED) as archive:
            archive.writestr(f"{app}/Info.plist", plistlib.dumps(info, fmt=plistlib.FMT_XML))
            archive.writestr(f"{app}/StarDust", macho())
            archive.writestr(f"{app}/embedded.mobileprovision", profile)
        return path.read_bytes()

    def make_source(self):
        inner = self.root / "unsigned.xcarchive.zip"
        app = "unsigned.xcarchive/Products/Applications/StarDust.app"
        archive_info = {"ApplicationProperties": {"ApplicationPath": "Applications/StarDust.app",
                        "CFBundleIdentifier": self.bundle, "CFBundleShortVersionString": self.version}}
        app_info = {"CFBundleIdentifier": self.bundle, "CFBundleShortVersionString": self.version,
                    "CFBundleExecutable": "StarDust"}
        with zipfile.ZipFile(inner, "w", compression=zipfile.ZIP_STORED) as archive:
            archive.writestr("unsigned.xcarchive/Info.plist", plistlib.dumps(archive_info, fmt=plistlib.FMT_XML))
            archive.writestr(f"{app}/Info.plist", plistlib.dumps(app_info, fmt=plistlib.FMT_XML))
            archive.writestr(f"{app}/StarDust", macho())
        source = {"platform": "ios", "architecture": "arm64", "bundle_id": self.bundle,
                  "version": self.version, "source_sha": self.source_sha}
        with zipfile.ZipFile(self.source, "w", compression=zipfile.ZIP_STORED) as archive:
            archive.write(inner, "unsigned.xcarchive.zip")
            archive.writestr("source.json", json.dumps(source, separators=(",", ":")))

    def make_report(self):
        ipa_path = self.root / "signed.ipa"
        ipa_path.write_bytes(self.ipa)
        return {
            "schema_version": 1, "request_id": self.request_id, "generation": 1, "stage": "ios_sign",
            "input_digest": "sha256:" + hashlib.sha256(self.source.read_bytes()).hexdigest(), "recipe_sha": self.recipe_sha,
            "policy_digest": "sha256:" + "c" * 64, "source_sha": self.source_sha, "version": self.version,
            "architecture": "arm64", "team_id": self.team, "bundle_id": self.bundle,
            "codesign_verified": True, "identity_class": "Apple Development",
            "certificate_expiration": self.certificate_expiration.isoformat().replace("+00:00", "Z"),
            "profile_uuid": self.profile_plist["UUID"],
            "profile_expiration": self.profile_expiration.isoformat().replace("+00:00", "Z"),
            "profile_type": "development", "authorized_device_count": 1,
            "files": [{"path": "signed.ipa", "size": len(self.ipa), "sha256": hashlib.sha256(self.ipa).hexdigest()}],
        }

    def make_output(self, ipa_bytes, extra=False):
        self.output.unlink(missing_ok=True)
        with zipfile.ZipFile(self.output, "w", compression=zipfile.ZIP_STORED) as archive:
            archive.writestr("signed.ipa", ipa_bytes)
            archive.writestr("verification.json", json.dumps(self.report, separators=(",", ":")))
            if extra:
                archive.writestr("extra.txt", "unexpected")

    def make_status(self, report):
        data = {"request_id": self.request_id, "state": "succeeded", "platform": "ios",
                "source_sha": self.source_sha, "version": self.version,
                "input_digest": report["input_digest"], "output": {"archive_size": self.output.stat().st_size,
                "archive_digest": "sha256:" + hashlib.sha256(self.output.read_bytes()).hexdigest(), "report": report}}
        self.status.write_text(json.dumps(data), encoding="utf-8")

    def run_check(self):
        return VERIFY.verify(self.status, self.output, self.source, self.recipe_sha, self.team, self.bundle,
                             self.local_profile, self.phone_record, OPENSSL)

    def test_valid_package_and_private_device_membership(self):
        result = self.run_check()
        self.assertEqual(result["bundle_id"], self.bundle)
        self.assertEqual(result["version"], self.version)
        self.assertEqual(result["authorized_device_count"], 1)
        self.assertNotIn(self.device_id, json.dumps(result))

    def test_rejects_report_mismatch_and_extra_output_entry(self):
        changed = dict(self.report, bundle_id="other.bundle")
        self.make_status(changed)
        with self.assertRaises(VERIFY.VerificationError):
            self.run_check()
        self.make_status(self.report)
        self.make_output(self.ipa, extra=True)
        self.make_status(self.report)
        with self.assertRaisesRegex(VERIFY.VerificationError, "exactly signed.ipa"):
            self.run_check()

    def test_rejects_tampered_ipa_bytes_even_when_output_zip_digest_is_updated(self):
        corrupted = self.ipa[:-1] + bytes([self.ipa[-1] ^ 1])
        self.make_output(corrupted)
        self.make_status(self.report)
        with self.assertRaisesRegex(VERIFY.VerificationError, "IPA bytes"):
            self.run_check()

    def test_rejects_source_artifact_digest_mismatch(self):
        data = bytearray(self.source.read_bytes())
        data[-1] ^= 1
        self.source.write_bytes(data)
        with self.assertRaisesRegex(VERIFY.VerificationError, "source artifact digest"):
            self.run_check()

    def test_requires_status_contract_fields(self):
        for field in ("platform", "source_sha", "version", "input_digest"):
            with self.subTest(field=field):
                self.make_output(self.ipa)
                self.make_status(self.report)
                status = json.loads(self.status.read_text(encoding="utf-8"))
                del status[field]
                self.status.write_text(json.dumps(status), encoding="utf-8")
                with self.assertRaises(VERIFY.VerificationError):
                    self.run_check()

    def test_rejects_status_input_digest_disagreement(self):
        self.make_output(self.ipa)
        self.make_status(self.report)
        status = json.loads(self.status.read_text(encoding="utf-8"))
        status["input_digest"] = "sha256:" + "0" * 64
        self.status.write_text(json.dumps(status), encoding="utf-8")
        with self.assertRaisesRegex(VERIFY.VerificationError, "digest does not match request status"):
            self.run_check()

    def test_rejects_profile_cms_tampering(self):
        corrupt = bytearray(self.profile.read_bytes())
        corrupt[-8] ^= 0x40
        with self.assertRaisesRegex(VERIFY.VerificationError, "CMS signature"):
            VERIFY.decode_profile(bytes(corrupt), self.root, "tampered", OPENSSL)


class MachOTests(unittest.TestCase):
    def test_requires_arm64_ios_device_platform(self):
        VERIFY.validate_macho(macho())
        with self.assertRaisesRegex(VERIFY.VerificationError, "arm64"):
            VERIFY.validate_macho(macho(cpu=0x01000007))
        with self.assertRaisesRegex(VERIFY.VerificationError, "simulator"):
            VERIFY.validate_macho(macho(platform=7))


if __name__ == "__main__":
    unittest.main()
