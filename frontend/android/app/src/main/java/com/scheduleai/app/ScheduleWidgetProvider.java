package com.scheduleai.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.os.Build;
import android.widget.RemoteViews;
import android.util.Pair;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
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

        // Configure click on widget to open URL
        Intent openIntent = new Intent(Intent.ACTION_VIEW, android.net.Uri.parse(BACKEND_URL));
        PendingIntent openPendingIntent = PendingIntent.getActivity(context, 1, openIntent, flags);
        views.setOnClickPendingIntent(R.id.img_timeline, openPendingIntent);

        views.setTextViewText(R.id.txt_status, "Atualizando cronograma...");
        appWidgetManager.updateAppWidget(appWidgetId, views);

        final PendingResult pendingResult = goAsync();

        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    String data = fetchWidgetData();
                    Bitmap bitmap;
                    if (data != null) {
                        bitmap = drawTimelineBitmap(data);
                    } else {
                        bitmap = drawErrorBitmap("Falha ao carregar dados");
                    }

                    views.setImageViewBitmap(R.id.img_timeline, bitmap);
                    SimpleDateFormat sdf = new SimpleDateFormat("HH:mm", Locale.getDefault());
                    views.setTextViewText(R.id.txt_status, "Atualizado às " + sdf.format(new Date()));
                    appWidgetManager.updateAppWidget(appWidgetId, views);
                } catch (Throwable e) {
                    e.printStackTrace();
                    views.setImageViewBitmap(R.id.img_timeline, drawErrorBitmap(e.getMessage() != null ? e.getMessage() : "Erro desconhecido"));
                    views.setTextViewText(R.id.txt_status, "Erro de atualização");
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

    private String fetchWidgetData() {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(BACKEND_URL + "/api/widget/data");
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);

            if (conn.getResponseCode() == 200) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                StringBuilder response = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    response.append(line);
                }
                reader.close();
                return response.toString();
            } else {
                return null;
            }
        } catch (Exception e) {
            e.printStackTrace();
            return null;
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    private Bitmap drawTimelineBitmap(String jsonStr) {
        int width = 500;
        int height = 260;
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
            paintTrack.setColor(Color.parseColor("#12FFFFFF")); // ~7% white opacity
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

            Paint paintSeparator = new Paint();
            paintSeparator.setColor(Color.parseColor("#1AFFFFFF"));
            paintSeparator.setStrokeWidth(1.5f);
            canvas.drawLine(15f, 95f, width - 15f, 95f, paintSeparator);

            Paint paintTimeBold = new Paint();
            paintTimeBold.setColor(Color.WHITE);
            paintTimeBold.setTextSize(13f);
            paintTimeBold.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
            paintTimeBold.setAntiAlias(true);
            paintTimeBold.setTextAlign(Paint.Align.LEFT);

            Paint paintSummary = new Paint();
            paintSummary.setColor(Color.WHITE);
            paintSummary.setTextSize(13f);
            paintSummary.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.NORMAL));
            paintSummary.setAntiAlias(true);
            paintSummary.setTextAlign(Paint.Align.LEFT);

            Paint paintSub = new Paint();
            paintSub.setColor(Color.parseColor("#888888"));
            paintSub.setTextSize(10f);
            paintSub.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.NORMAL));
            paintSub.setAntiAlias(true);
            paintSub.setTextAlign(Paint.Align.LEFT);

            int maxItems = Math.min(parsedEvents.size(), 3);
            for (int i = 0; i < maxItems; i++) {
                EventItem item = parsedEvents.get(i);
                float yStart = 122f + i * 46f;
                Paint paintColor = new Paint();
                paintColor.setColor(Color.parseColor(item.colorHex));
                paintColor.setAntiAlias(true);
                canvas.drawCircle(25f, yStart, 5f, paintColor);

                String startStr = sdfTime.format(new Date(item.startMs));
                String endStr = sdfTime.format(new Date(item.endMs));
                String timeRange = startStr + " - " + endStr;

                canvas.drawText(timeRange, 42f, yStart + 4f, paintTimeBold);

                float timeWidth = paintTimeBold.measureText(timeRange);
                float summaryX = 42f + timeWidth + 15f;
                float maxSummaryWidth = width - summaryX - 15f;
                drawTextLeftAligned(canvas, item.summary, summaryX, yStart + 4f, maxSummaryWidth, paintSummary);

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

                if (subText.length() > 0) {
                    canvas.drawText(subText.toString(), 42f, yStart + 18f, paintSub);
                }
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

    private void drawTextLeftAligned(Canvas canvas, String text, float x, float y, float maxWidth, Paint paint) {
        String drawText = text;
        float textWidth = paint.measureText(drawText);
        if (textWidth > maxWidth) {
            int len = drawText.length();
            while (len > 1 && paint.measureText(drawText.substring(0, len) + "...") > maxWidth) {
                len--;
            }
            drawText = len > 1 ? drawText.substring(0, len) + "..." : "...";
        }
        canvas.drawText(drawText, x, y, paint);
    }

    private Bitmap drawPlaceholderBitmap(String message) {
        int width = 500;
        int height = 260;
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
        int height = 260;
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
