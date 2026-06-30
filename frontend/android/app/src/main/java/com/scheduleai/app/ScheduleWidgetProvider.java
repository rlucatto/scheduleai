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
        int height = 100;
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

            // Draw timeline track/background
            Paint paintTrack = new Paint();
            paintTrack.setColor(Color.parseColor("#12FFFFFF")); // ~7% white opacity
            paintTrack.setAntiAlias(true);
            RectF trackRect = new RectF(0f, barTop, width, barBottom);
            canvas.drawRoundRect(trackRect, 6f, 6f, paintTrack);

            class TickItem {
                long time;
                float pct;
                TickItem(long time, float pct) {
                    this.time = time;
                    this.pct = pct;
                }
            }
            ArrayList<TickItem> ticks = new ArrayList<>();

            for (int i = 0; i < eventsArray.length(); i++) {
                JSONObject event = eventsArray.getJSONObject(i);
                String getReadyTime = event.getString("getReadyTime");
                String departureTime = event.getString("departureTime");
                String eventStartTime = event.getString("eventStartTime");
                String eventEndTime = event.getString("eventEndTime");
                String colorHex = event.getString("color");
                String summary = event.getString("summary");

                float readyPct = pctCalculator.getPct(getReadyTime);
                float departPct = pctCalculator.getPct(departureTime);
                float startPct = pctCalculator.getPct(eventStartTime);
                float endPct = pctCalculator.getPct(eventEndTime);

                long grTime = dateParser.parse(getReadyTime);
                long depTime = dateParser.parse(departureTime);
                long stTime = dateParser.parse(eventStartTime);
                long enTime = dateParser.parse(eventEndTime);

                ticks.add(new TickItem(grTime, readyPct));
                ticks.add(new TickItem(depTime, departPct));
                ticks.add(new TickItem(stTime, startPct));
                ticks.add(new TickItem(enTime, endPct));

                // 1. Se arrumar (Lilás #a855f7)
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

                // 2. Deslocamento (Laranja #f59e0b)
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

                // 3. Appointment (Cor do evento)
                if (endPct > startPct) {
                    float left = (startPct / 100f) * width + 1f;
                    float right = (endPct / 100f) * width - 1f;
                    if (right > left) {
                        paintRect.setColor(Color.parseColor(colorHex));
                        RectF rect = new RectF(left, barTop, right, barBottom);
                        canvas.drawRoundRect(rect, 6f, 6f, paintRect);
                        drawTextInside(canvas, summary, rect, paintText);
                    }
                }
            }

            // Draw vertical indicator for "Now" if current time is within range
            long nowTime = System.currentTimeMillis();
            if (nowTime >= minTime && nowTime <= maxTime) {
                float nowPct = ((float) (nowTime - minTime) / (float) totalDuration) * 100f;
                float nowX = (nowPct / 100f) * width;

                // Draw line
                Paint paintNowLine = new Paint();
                paintNowLine.setColor(Color.parseColor("#06B6D4")); // Cyan
                paintNowLine.setStrokeWidth(2f);
                canvas.drawLine(nowX, barTop - 4f, nowX, barBottom + 12f, paintNowLine);

                // Draw small dot
                Paint paintNowDot = new Paint();
                paintNowDot.setColor(Color.parseColor("#06B6D4"));
                paintNowDot.setAntiAlias(true);
                canvas.drawCircle(nowX, barTop - 4f, 3.5f, paintNowDot);
            }

            // Draw time ticks
            Collections.sort(ticks, new Comparator<TickItem>() {
                @Override
                public int compare(TickItem o1, TickItem o2) {
                    return Long.compare(o1.time, o2.time);
                }
            });

            ArrayList<TickItem> uniqueTicks = new ArrayList<>();
            for (TickItem tick : ticks) {
                boolean duplicate = false;
                for (TickItem ut : uniqueTicks) {
                    if (Math.abs(ut.time - tick.time) < 60 * 1000) {
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
                TickItem tick = uniqueTicks.get(idx);
                float x = (tick.pct / 100f) * width;
                String label = sdfTime.format(new Date(tick.time));

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
        int height = 100;
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
        int height = 100;
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
