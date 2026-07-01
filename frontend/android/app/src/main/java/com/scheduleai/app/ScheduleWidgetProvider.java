package com.scheduleai.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Pair;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

public class ScheduleWidgetProvider extends AppWidgetProvider {

    public static final String ACTION_REFRESH_WIDGET = "com.scheduleai.app.ACTION_REFRESH_WIDGET";
    public static final String BACKEND_URL = "https://scheduleai-hz68.onrender.com";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_REFRESH_WIDGET.equals(intent.getAction())) {
            AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
            ComponentName componentName = new ComponentName(context, ScheduleWidgetProvider.class);
            int[] appWidgetIds = appWidgetManager.getAppWidgetIds(componentName);
            onUpdate(context, appWidgetManager, appWidgetIds);
        }
    }

    private void updateWidget(final Context context, final AppWidgetManager appWidgetManager, final int appWidgetId) {
        final RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.schedule_widget);

        // Configure refresh button
        Intent refreshIntent = new Intent(context, ScheduleWidgetProvider.class);
        refreshIntent.setAction(ACTION_REFRESH_WIDGET);
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? 
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE : 
                PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent refreshPendingIntent = PendingIntent.getBroadcast(context, 0, refreshIntent, flags);
        views.setOnClickPendingIntent(R.id.btn_refresh, refreshPendingIntent);

        views.setTextViewText(R.id.txt_status, "v1.8 - ... (Atualizando)");
        appWidgetManager.updateAppWidget(appWidgetId, views);

        final PendingResult pendingResult = goAsync();

        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    String data = fetchWidgetData(context);
                    if (data != null && !data.startsWith("ERROR: ")) {
                        // Render timeline graphic
                        Bitmap bitmap = drawTimelineBitmap(data);
                        views.setImageViewBitmap(R.id.img_timeline, bitmap);
                        
                        // Populate native event list and interactivity
                        populateWidgetUI(context, appWidgetManager, appWidgetId, views, data);
                        
                        SimpleDateFormat sdf = new SimpleDateFormat("HH:mm", Locale.getDefault());
                        views.setTextViewText(R.id.txt_status, "v1.8 - Atualizado às " + sdf.format(new Date()));
                    } else {
                        String errMsg = "Falha ao carregar dados";
                        if (data != null && data.startsWith("ERROR: ")) {
                            errMsg = data.substring(7);
                        }
                        views.setImageViewBitmap(R.id.img_timeline, drawErrorBitmap(errMsg));
                        hideAllEventRows(views);
                        views.setTextViewText(R.id.txt_status, "v1.8 - " + errMsg);
                    }
                    appWidgetManager.updateAppWidget(appWidgetId, views);
                } catch (Throwable e) {
                    e.printStackTrace();
                    views.setImageViewBitmap(R.id.img_timeline, drawErrorBitmap(e.getMessage() != null ? e.getMessage() : "Erro desconhecido"));
                    hideAllEventRows(views);
                    views.setTextViewText(R.id.txt_status, "v1.8 - Erro: " + (e.getMessage() != null ? e.getMessage() : "Erro desconhecido"));
                    appWidgetManager.updateAppWidget(appWidgetId, views);
                } finally {
                    if (pendingResult != null) {
                        try {
                            pendingResult.finish();
                        } catch (Exception e) {
                            e.printStackTrace();
                        }
                    }
                }
            }
        }).start();
    }

    private void hideAllEventRows(RemoteViews views) {
        views.setViewVisibility(R.id.row_event_1, View.GONE);
        views.setViewVisibility(R.id.row_event_2, View.GONE);
        views.setViewVisibility(R.id.row_event_3, View.GONE);
    }

    private void populateWidgetUI(Context context, AppWidgetManager appWidgetManager, int appWidgetId, RemoteViews views, String jsonStr) {
        try {
            JSONObject json = new JSONObject(jsonStr);
            JSONArray eventsArray = json.optJSONArray("events");
            if (eventsArray == null) eventsArray = new JSONArray();

            if (eventsArray.length() == 0) {
                hideAllEventRows(views);
                return;
            }

            String minTimeStr = json.getString("minTime");
            String maxTimeStr = json.getString("maxTime");

            final SimpleDateFormat sdfParserWithMs = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            sdfParserWithMs.setTimeZone(TimeZone.getTimeZone("UTC"));
            final SimpleDateFormat sdfParserWithoutMs = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
            sdfParserWithoutMs.setTimeZone(TimeZone.getTimeZone("UTC"));

            class DateParser {
                long parse(String isoStr) {
                    try {
                        return sdfParserWithMs.parse(isoStr).getTime();
                    } catch (Exception e) {
                        try {
                            return sdfParserWithoutMs.parse(isoStr).getTime();
                        } catch (Exception e2) {
                            return 0L;
                        }
                    }
                }
            }
            final DateParser dateParser = new DateParser();

            final long minTime = dateParser.parse(minTimeStr);
            final long maxTime = dateParser.parse(maxTimeStr);
            final long totalDuration = maxTime - minTime;

            class EventItem {
                String id;
                String summary;
                String location;
                String htmlLink;
                String colorHex;
                long startMs;
                long endMs;
                long departureMs;
                long readyMs;
            }

            ArrayList<EventItem> parsedEvents = new ArrayList<>();
            for (int i = 0; i < eventsArray.length(); i++) {
                JSONObject event = eventsArray.getJSONObject(i);
                EventItem item = new EventItem();
                item.id = event.optString("id", "");
                item.summary = event.getString("summary");
                item.location = event.optString("location", "");
                item.htmlLink = event.optString("htmlLink", "");
                item.colorHex = event.getString("color");
                item.readyMs = dateParser.parse(event.getString("getReadyTime"));
                item.departureMs = dateParser.parse(event.getString("departureTime"));
                item.startMs = dateParser.parse(event.getString("eventStartTime"));
                item.endMs = dateParser.parse(event.getString("eventEndTime"));
                parsedEvents.add(item);
            }

            // Sort events chronologically
            Collections.sort(parsedEvents, new Comparator<EventItem>() {
                @Override
                public int compare(EventItem o1, EventItem o2) {
                    return Long.compare(o1.startMs, o2.startMs);
                }
            });

            // Set up transparent overlay areas on the timeline chart for the next upcoming event (item 0)
            if (parsedEvents.size() > 0 && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && totalDuration > 0) {
                EventItem firstItem = parsedEvents.get(0);
                
                Bundle widgetOptions = appWidgetManager.getAppWidgetOptions(appWidgetId);
                int widgetWidthDp = widgetOptions.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 260);

                float readyPct = ((float) (firstItem.readyMs - minTime) / totalDuration) * 100f;
                float departPct = ((float) (firstItem.departureMs - minTime) / totalDuration) * 100f;
                float startPct = ((float) (firstItem.startMs - minTime) / totalDuration) * 100f;
                float endPct = ((float) (firstItem.endMs - minTime) / totalDuration) * 100f;

                float widthBefore = (readyPct / 100f) * widgetWidthDp;
                float widthPrep = ((departPct - readyPct) / 100f) * widgetWidthDp;
                float widthTravel = ((startPct - departPct) / 100f) * widgetWidthDp;
                float widthEvent = ((endPct - startPct) / 100f) * widgetWidthDp;
                float widthAfter = ((100f - endPct) / 100f) * widgetWidthDp;

                views.setViewLayoutWidth(R.id.click_before, Math.max(0, widthBefore), TypedValue.COMPLEX_UNIT_DIP);
                views.setViewLayoutWidth(R.id.click_prep, Math.max(0, widthPrep), TypedValue.COMPLEX_UNIT_DIP);
                views.setViewLayoutWidth(R.id.click_travel, Math.max(0, widthTravel), TypedValue.COMPLEX_UNIT_DIP);
                views.setViewLayoutWidth(R.id.click_event, Math.max(0, widthEvent), TypedValue.COMPLEX_UNIT_DIP);
                views.setViewLayoutWidth(R.id.click_after, Math.max(0, widthAfter), TypedValue.COMPLEX_UNIT_DIP);

                int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;

                // 1. click_before / click_after / click_prep -> Open App
                Intent appLaunchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
                PendingIntent appPI = PendingIntent.getActivity(context, 10, appLaunchIntent, piFlags);
                views.setOnClickPendingIntent(R.id.click_before, appPI);
                views.setOnClickPendingIntent(R.id.click_prep, appPI);
                views.setOnClickPendingIntent(R.id.click_after, appPI);

                // 2. click_travel -> Open Google Maps with event location
                if (firstItem.location != null && !firstItem.location.isEmpty()) {
                    String geoUri = "https://www.google.com/maps/search/?api=1&query=" + URLEncoder.encode(firstItem.location, "UTF-8");
                    Intent mapsIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(geoUri));
                    PendingIntent mapsPI = PendingIntent.getActivity(context, 11, mapsIntent, piFlags);
                    views.setOnClickPendingIntent(R.id.click_travel, mapsPI);
                } else {
                    views.setOnClickPendingIntent(R.id.click_travel, appPI);
                }

                // 3. click_event -> Open Event Link (Google Calendar event details)
                if (firstItem.htmlLink != null && !firstItem.htmlLink.isEmpty()) {
                    Intent calendarIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(firstItem.htmlLink));
                    PendingIntent calPI = PendingIntent.getActivity(context, 12, calendarIntent, piFlags);
                    views.setOnClickPendingIntent(R.id.click_event, calPI);
                } else {
                    views.setOnClickPendingIntent(R.id.click_event, appPI);
                }
            }

            // Populate the three list rows
            SimpleDateFormat sdfTime = new SimpleDateFormat("HH:mm", Locale.getDefault());
            sdfTime.setTimeZone(TimeZone.getDefault());

            int[] rowIds = { R.id.row_event_1, R.id.row_event_2, R.id.row_event_3 };
            int[] dotIds = { R.id.dot_event_1, R.id.dot_event_2, R.id.dot_event_3 };
            int[] timeIds = { R.id.time_event_1, R.id.time_event_2, R.id.time_event_3 };
            int[] titleIds = { R.id.title_event_1, R.id.title_event_2, R.id.title_event_3 };
            int[] subIds = { R.id.sub_event_1, R.id.sub_event_2, R.id.sub_event_3 };

            int maxItems = Math.min(parsedEvents.size(), 3);
            for (int i = 0; i < 3; i++) {
                if (i < maxItems) {
                    EventItem item = parsedEvents.get(i);
                    views.setViewVisibility(rowIds[i], View.VISIBLE);
                    
                    // Set color filter on the dot
                    int colorVal = Color.parseColor(item.colorHex);
                    views.setInt(dotIds[i], "setColorFilter", colorVal);

                    // Set time range
                    String startStr = sdfTime.format(new Date(item.startMs));
                    String endStr = sdfTime.format(new Date(item.endMs));
                    views.setTextViewText(timeIds[i], startStr + " - " + endStr);

                    // Set title
                    views.setTextViewText(titleIds[i], item.summary);

                    // Set sub info text
                    long prepMin = (item.departureMs - item.readyMs) / (60 * 1000);
                    long travelMin = (item.startMs - item.departureMs) / (60 * 1000);
                    StringBuilder subText = new StringBuilder();
                    if (prepMin > 0) {
                        subText.append("🚿 Se arrumar: ").append(prepMin).append("m");
                    }
                    if (travelMin > 0) {
                        if (subText.length() > 0) subText.append("  •  ");
                        subText.append("🚗 Deslocamento: ").append(travelMin).append("m");
                    }

                    int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
                    
                    // Click on Row / Title -> Open Event or App
                    Intent mainLaunchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
                    PendingIntent rowPI = PendingIntent.getActivity(context, 100 + i, mainLaunchIntent, piFlags);
                    if (item.htmlLink != null && !item.htmlLink.isEmpty()) {
                        Intent calendarIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(item.htmlLink));
                        rowPI = PendingIntent.getActivity(context, 100 + i, calendarIntent, piFlags);
                    }
                    views.setOnClickPendingIntent(rowIds[i], rowPI);

                    if (subText.length() > 0) {
                        views.setViewVisibility(subIds[i], View.VISIBLE);
                        views.setTextViewText(subIds[i], subText.toString());

                        // Click on Subtitle/Deslocamento -> Open Google Maps
                        if (item.location != null && !item.location.isEmpty()) {
                            String mapUrl = "https://www.google.com/maps/search/?api=1&query=" + URLEncoder.encode(item.location, "UTF-8");
                            Intent mapsIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(mapUrl));
                            PendingIntent mapsPI = PendingIntent.getActivity(context, 200 + i, mapsIntent, piFlags);
                            views.setOnClickPendingIntent(subIds[i], mapsPI);
                        } else {
                            views.setOnClickPendingIntent(subIds[i], rowPI);
                        }
                    } else {
                        views.setViewVisibility(subIds[i], View.GONE);
                    }
                } else {
                    views.setViewVisibility(rowIds[i], View.GONE);
                }
            }

        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private String fetchWidgetData(Context context) {
        SharedPreferences prefs = context.getSharedPreferences("WidgetPrefs", Context.MODE_PRIVATE);
        String backendUrl = prefs.getString("backend_url", BACKEND_URL);
        android.util.Log.d("ScheduleWidget", "fetchWidgetData starting. backendUrl=" + backendUrl);

        HttpURLConnection conn = null;
        try {
            URL url = new URL(backendUrl + "/api/widget/data");
            android.util.Log.d("ScheduleWidget", "Connecting to: " + url.toString());
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);

            int responseCode = conn.getResponseCode();
            android.util.Log.d("ScheduleWidget", "HTTP Response Code: " + responseCode);
            if (responseCode == 200) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                StringBuilder response = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    response.append(line);
                }
                reader.close();
                android.util.Log.d("ScheduleWidget", "Fetch succeeded. Response length=" + response.length());
                return response.toString();
            } else {
                android.util.Log.e("ScheduleWidget", "HTTP error code: " + responseCode);
                return "ERROR: HTTP " + responseCode;
            }
        } catch (Exception e) {
            android.util.Log.e("ScheduleWidget", "Exception in fetchWidgetData", e);
            return "ERROR: " + e.getClass().getSimpleName() + ": " + e.getMessage();
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    private Bitmap drawTimelineBitmap(String jsonStr) {
        int width = 500;
        int height = 85;
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.drawColor(Color.TRANSPARENT);

        try {
            JSONObject json = new JSONObject(jsonStr);
            JSONArray eventsArray = json.optJSONArray("events");
            if (eventsArray == null) eventsArray = new JSONArray();

            if (eventsArray.length() == 0) {
                return drawPlaceholderBitmap("Nenhum compromisso hoje");
            }

            String minTimeStr = json.getString("minTime");
            String maxTimeStr = json.getString("maxTime");

            final SimpleDateFormat sdfParserWithMs = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            sdfParserWithMs.setTimeZone(TimeZone.getTimeZone("UTC"));
            final SimpleDateFormat sdfParserWithoutMs = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
            sdfParserWithoutMs.setTimeZone(TimeZone.getTimeZone("UTC"));

            class DateParser {
                long parse(String isoStr) {
                    try {
                        return sdfParserWithMs.parse(isoStr).getTime();
                    } catch (Exception e) {
                        try {
                            return sdfParserWithoutMs.parse(isoStr).getTime();
                        } catch (Exception e2) {
                            return 0L;
                        }
                    }
                }
            }
            final DateParser dateParser = new DateParser();

            final long minTime = dateParser.parse(minTimeStr);
            final long maxTime = dateParser.parse(maxTimeStr);
            final long totalDuration = maxTime - minTime;

            class PctCalculator {
                float getPct(String isoStr) {
                    long time = dateParser.parse(isoStr);
                    if (totalDuration <= 0L) return 0f;
                    return ((float) (time - minTime) / (float) totalDuration) * 100f;
                }
            }
            final PctCalculator pctCalculator = new PctCalculator();

            Paint paintRect = new Paint();
            paintRect.setAntiAlias(true);

            Paint paintText = new Paint();
            paintText.setColor(Color.WHITE);
            paintText.setTextSize(13f);
            paintText.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
            paintText.setAntiAlias(true);
            paintText.setTextAlign(Paint.Align.CENTER);

            Paint paintTick = new Paint();
            paintTick.setColor(Color.parseColor("#888888"));
            paintTick.setTextSize(11f);
            paintTick.setAntiAlias(true);
            paintTick.setTextAlign(Paint.Align.CENTER);

            float barTop = 10f;
            float barBottom = 50f;

            Paint paintTrack = new Paint();
            paintTrack.setColor(Color.parseColor("#12FFFFFF")); 
            paintTrack.setAntiAlias(true);
            RectF trackRect = new RectF(0f, barTop, width, barBottom);
            canvas.drawRoundRect(trackRect, 6f, 6f, paintTrack);

            class EventItem {
                String summary;
                String colorHex;
                long startMs;
                long endMs;
                long departureMs;
                long readyMs;
            }
            ArrayList<EventItem> parsedEvents = new ArrayList<>();
            for (int i = 0; i < eventsArray.length(); i++) {
                JSONObject event = eventsArray.getJSONObject(i);
                EventItem item = new EventItem();
                item.summary = event.getString("summary");
                item.colorHex = event.getString("color");
                item.readyMs = dateParser.parse(event.getString("getReadyTime"));
                item.departureMs = dateParser.parse(event.getString("departureTime"));
                item.startMs = dateParser.parse(event.getString("eventStartTime"));
                item.endMs = dateParser.parse(event.getString("eventEndTime"));
                parsedEvents.add(item);
            }

            Collections.sort(parsedEvents, new Comparator<EventItem>() {
                @Override
                public int compare(EventItem o1, EventItem o2) {
                    return Long.compare(o1.startMs, o2.startMs);
                }
            });

            ArrayList<Pair<Long, Float>> ticks = new ArrayList<>();

            for (EventItem item : parsedEvents) {
                float readyPct = pctCalculator.getPct(new Date(item.readyMs).toInstant().toString());
                float departPct = pctCalculator.getPct(new Date(item.departureMs).toInstant().toString());
                float startPct = pctCalculator.getPct(new Date(item.startMs).toInstant().toString());
                float endPct = pctCalculator.getPct(new Date(item.endMs).toInstant().toString());

                ticks.add(new Pair<>(item.readyMs, readyPct));
                ticks.add(new Pair<>(item.departureMs, departPct));
                ticks.add(new Pair<>(item.startMs, startPct));
                ticks.add(new Pair<>(item.endMs, endPct));

                if (departPct > readyPct) {
                    float left = (readyPct / 100f) * width + 1f;
                    float right = (departPct / 100f) * width - 1f;
                    if (right > left) {
                        paintRect.setColor(Color.parseColor("#a855f7"));
                        RectF rect = new RectF(left, barTop, right, barBottom);
                        canvas.drawRoundRect(rect, 6f, 6f, paintRect);
                        drawTextInside(canvas, "Se arrumar", rect, paintText);
                    }
                }

                if (startPct > departPct) {
                    float left = (departPct / 100f) * width + 1f;
                    float right = (startPct / 100f) * width - 1f;
                    if (right > left) {
                        paintRect.setColor(Color.parseColor("#f59e0b"));
                        RectF rect = new RectF(left, barTop, right, barBottom);
                        canvas.drawRoundRect(rect, 6f, 6f, paintRect);
                        drawTextInside(canvas, "Deslocamento", rect, paintText);
                    }
                }

                if (endPct > startPct) {
                    float left = (startPct / 100f) * width + 1f;
                    float right = (endPct / 100f) * width - 1f;
                    if (right > left) {
                        paintRect.setColor(Color.parseColor(item.colorHex));
                        RectF rect = new RectF(left, barTop, right, barBottom);
                        canvas.drawRoundRect(rect, 6f, 6f, paintRect);
                        drawTextInside(canvas, item.summary, rect, paintText);
                    }
                }
            }

            long nowTime = System.currentTimeMillis();
            if (nowTime >= minTime && nowTime <= maxTime) {
                float nowPct = ((float) (nowTime - minTime) / (float) totalDuration) * 100f;
                float nowX = (nowPct / 100f) * width;

                Paint paintNowLine = new Paint();
                paintNowLine.setColor(Color.parseColor("#06B6D4"));
                paintNowLine.setStrokeWidth(2f);
                canvas.drawLine(nowX, barTop - 4f, nowX, barBottom + 12f, paintNowLine);
                Paint paintNowDot = new Paint();
                paintNowDot.setColor(Color.parseColor("#06B6D4"));
                paintNowDot.setAntiAlias(true);
                canvas.drawCircle(nowX, barTop - 4f, 3.5f, paintNowDot);
            }

            Collections.sort(ticks, new Comparator<Pair<Long, Float>>() {
                @Override
                public int compare(Pair<Long, Float> o1, Pair<Long, Float> o2) {
                    return Long.compare(o1.first, o2.first);
                }
            });

            ArrayList<Pair<Long, Float>> uniqueTicks = new ArrayList<>();
            for (Pair<Long, Float> tick : ticks) {
                boolean duplicate = false;
                for (Pair<Long, Float> ut : uniqueTicks) {
                    if (Math.abs(ut.first - tick.first) < 60 * 1000) {
                        duplicate = true;
                        break;
                    }
                }
                if (!duplicate) {
                    uniqueTicks.add(tick);
                }
            }

            SimpleDateFormat sdfTime = new SimpleDateFormat("HH:mm", Locale.getDefault());
            sdfTime.setTimeZone(TimeZone.getDefault());

            for (int idx = 0; idx < uniqueTicks.size(); idx++) {
                Pair<Long, Float> tick = uniqueTicks.get(idx);
                float x = (tick.second / 100f) * width;
                String label = sdfTime.format(new Date(tick.first));

                if (idx == 0) {
                    paintTick.setTextAlign(Paint.Align.LEFT);
                } else if (idx == uniqueTicks.size() - 1) {
                    paintTick.setTextAlign(Paint.Align.RIGHT);
                } else {
                    paintTick.setTextAlign(Paint.Align.CENTER);
                }

                float finalX;
                if (idx == 0) {
                    finalX = 4f;
                } else if (idx == uniqueTicks.size() - 1) {
                    finalX = width - 4f;
                } else {
                    finalX = x;
                }

                canvas.drawText(label, finalX, barBottom + 25f, paintTick);
            }

        } catch (Exception e) {
            e.printStackTrace();
        }

        return bitmap;
    }

    private void drawTextInside(Canvas canvas, String text, RectF rect, Paint paint) {
        float rectWidth = rect.width();
        if (rectWidth < 30f) return;

        String drawText = text;
        float textWidth = paint.measureText(drawText);
        if (textWidth > rectWidth - 6f) {
            int len = drawText.length();
            while (len > 1 && paint.measureText(drawText.substring(0, len) + "...") > rectWidth - 6f) {
                len--;
            }
            drawText = len > 1 ? drawText.substring(0, len) + "..." : "...";
        }

        Rect bounds = new Rect();
        paint.getTextBounds(drawText, 0, drawText.length(), bounds);
        float y = rect.centerY() + (bounds.height() / 2f);

        canvas.drawText(drawText, rect.centerX(), y, paint);
    }

    private Bitmap drawPlaceholderBitmap(String message) {
        int width = 500;
        int height = 85;
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.drawColor(Color.TRANSPARENT);

        Paint paintText = new Paint();
        paintText.setColor(Color.parseColor("#888888"));
        paintText.setTextSize(15f);
        paintText.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.NORMAL));
        paintText.setAntiAlias(true);
        paintText.setTextAlign(Paint.Align.CENTER);

        canvas.drawText(message, width / 2f, height / 2f, paintText);
        return bitmap;
    }

    private Bitmap drawErrorBitmap(String error) {
        int width = 500;
        int height = 85;
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.drawColor(Color.TRANSPARENT);

        Paint paintText = new Paint();
        paintText.setColor(Color.parseColor("#ff4d4d"));
        paintText.setTextSize(14f);
        paintText.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        paintText.setAntiAlias(true);
        paintText.setTextAlign(Paint.Align.CENTER);

        canvas.drawText("Erro: " + error, width / 2f, height / 2f, paintText);
        return bitmap;
    }
}
