package com.stardust.fans;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.widget.BaseAdapter;
import android.widget.EditText;
import android.widget.ListView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;

/**
 * 搜索页：调用站点公开接口（/api/songs、/api/fanart、/api/shop）在本地过滤，
 * 点击结果回到主界面并跳到对应页面。不需要登录。
 */
public final class SearchActivity extends Activity {
    private EditText input;
    private ListView listView;
    private TextView status;
    private ResultAdapter adapter;

    private final List<ApiClient.SearchResult> results = new ArrayList<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_search);

        input = findViewById(R.id.search_input);
        listView = findViewById(R.id.search_results);
        status = findViewById(R.id.search_status);

        findViewById(R.id.btn_back).setOnClickListener(v -> finish());

        adapter = new ResultAdapter();
        listView.setAdapter(adapter);
        listView.setOnItemClickListener((parent, view, position, id) -> openResult(results.get(position)));

        input.setOnEditorActionListener((v, actionId, event) -> {
            boolean enter = event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER;
            if (actionId == EditorInfo.IME_ACTION_SEARCH || enter) {
                doSearch(input.getText().toString());
                return true;
            }
            return false;
        });

        String initial = getIntent().getStringExtra("query");
        if (initial != null && !initial.trim().isEmpty()) {
            input.setText(initial);
            input.setSelection(initial.length());
            doSearch(initial);
        } else {
            input.requestFocus();
        }
    }

    private void doSearch(String rawQuery) {
        final String query = rawQuery == null ? "" : rawQuery.trim();
        if (query.isEmpty()) {
            results.clear();
            adapter.notifyDataSetChanged();
            status.setText("输入关键词开始搜索");
            status.setVisibility(View.VISIBLE);
            return;
        }

        status.setText("搜索中…");
        status.setVisibility(View.VISIBLE);

        new Thread(() -> {
            final List<ApiClient.SearchResult> found = ApiClient.search(query);
            runOnUiThread(() -> {
                results.clear();
                results.addAll(found);
                adapter.notifyDataSetChanged();
                if (found.isEmpty()) {
                    status.setText("没找到与「" + query + "」相关的内容");
                    status.setVisibility(View.VISIBLE);
                } else {
                    status.setText("共 " + found.size() + " 条结果");
                    status.setVisibility(View.GONE);
                }
            });
        }, "stardust-search").start();
    }

    private void openResult(ApiClient.SearchResult result) {
        if (result == null) {
            return;
        }
        Intent intent = new Intent(this, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(Uri.parse(result.url));
        intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(intent);
        finish();
    }

    private final class ResultAdapter extends BaseAdapter {
        @Override
        public int getCount() {
            return results.size();
        }

        @Override
        public Object getItem(int position) {
            return results.get(position);
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public View getView(int position, View convertView, ViewGroup parent) {
            View view = convertView;
            if (view == null) {
                view = LayoutInflater.from(SearchActivity.this)
                        .inflate(R.layout.item_search_result, parent, false);
            }
            ApiClient.SearchResult item = results.get(position);

            TextView type = view.findViewById(R.id.result_type);
            TextView title = view.findViewById(R.id.result_title);
            TextView sub = view.findViewById(R.id.result_sub);

            type.setText(item.type);
            title.setText(item.title);
            if (item.subtitle == null || item.subtitle.isEmpty()) {
                sub.setVisibility(View.GONE);
            } else {
                sub.setVisibility(View.VISIBLE);
                sub.setText(item.subtitle);
            }
            return view;
        }
    }
}
