package com.scheduleai.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.*
import android.os.Build
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.*
import kotlin.concurrent.thread

class ScheduleWidgetProvider : AppWidgetProvider() {

    companion object {
        const val ACTION_REFRESH_WIDGET = "com.scheduleai.app.ACTION_REFRESH_WIDGET"
        const val BACKEND_URL = "https://scheduleai-hz68.onrender.com" // Altere para seu ip de desenvolvimento se necessário
    }

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (appWidgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH_WIDGET) {
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val componentName = ComponentName(context, ScheduleWidgetProvider::class.java)
            val appWidgetIds = appWidgetManager.getAppWidgetIds(componentName)
            onUpdate(context, appWidgetManager, appWidgetIds)
        }
    }

    private fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
        val views = RemoteViews(context.packageName, R.layout.schedule_widget)

        // Configura botão de refresh
        val refreshIntent = Intent(context, ScheduleWidgetProvider::class.java).apply {
            action = ACTION_REFRESH_WIDGET
        }
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        val refreshPendingIntent = PendingIntent.getBroadcast(context, 0, refreshIntent, flags)
        views.setOnClickPendingIntent(R.id.btn_refresh, refreshPendingIntent)

        // Configura clique no widget para abrir a PWA no navegador
        val openIntent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(BACKEND_URL))
        val openPendingIntent = PendingIntent.getActivity(context, 1, openIntent, flags)
        views.setOnClickPendingIntent(R.id.img_timeline, openPendingIntent)

        views.setTextViewText(R.id.txt_status, "Atualizando cronograma...")
        appWidgetManager.updateAppWidget(appWidgetId, views)

        // Efetua busca assíncrona dos dados e desenha no canvas
        thread {
            try {
                val data = fetchWidgetData()
                val bitmap = if (data != null) {
                    drawTimelineBitmap(data)
                } else {
                    drawErrorBitmap("Falha ao carregar dados")
                }

                views.setImageViewBitmap(R.id.img_timeline, bitmap)
                val sdf = SimpleDateFormat("HH:mm", Locale.getDefault())
                views.setTextViewText(R.id.txt_status, "Atualizado às " + sdf.format(Date()))
                appWidgetManager.updateAppWidget(appWidgetId, views)
            } catch (e: Throwable) {
                e.printStackTrace()
                views.setImageViewBitmap(R.id.img_timeline, drawErrorBitmap(e.message ?: "Erro desconhecido"))
                views.setTextViewText(R.id.txt_status, "Erro de atualização")
                appWidgetManager.updateAppWidget(appWidgetId, views)
            }
        }
    }

    private fun fetchWidgetData(): String? {
        var conn: HttpURLConnection? = null
        return try {
            val url = URL("$BACKEND_URL/api/widget/data")
            conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.connectTimeout = 8000
            conn.readTimeout = 8000
            
            if (conn.responseCode == 200) {
                val reader = BufferedReader(InputStreamReader(conn.inputStream))
                val response = StringBuilder()
                var line: String?
                while (reader.readLine().also { line = it } != null) {
                    response.append(line)
                }
                reader.close()
                response.toString()
            } else {
                null
            }
        } catch (e: Exception) {
            e.printStackTrace()
            null
        } finally {
            conn?.disconnect()
        }
    }

    private fun drawTimelineBitmap(jsonStr: String): Bitmap {
        val width = 800
        val height = 160
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.TRANSPARENT)

        val json = JSONObject(jsonStr)
        val eventsArray = json.optJSONArray("events") ?: JSONArray()

        if (eventsArray.length() == 0) {
            return drawPlaceholderBitmap("Nenhum compromisso hoje")
        }

        val minTimeStr = json.getString("minTime")
        val maxTimeStr = json.getString("maxTime")
        val sdfParser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }

        val minTime = sdfParser.parse(minTimeStr)?.time ?: 0L
        val maxTime = sdfParser.parse(maxTimeStr)?.time ?: 0L
        val totalDuration = maxTime - minTime

        fun getPct(isoStr: String): Float {
            val time = sdfParser.parse(isoStr)?.time ?: 0L
            if (totalDuration <= 0L) return 0f
            return ((time - minTime).toFloat() / totalDuration.toFloat()) * 100f
        }

        val paintRect = Paint().apply { isAntiAlias = true }
        val paintText = Paint().apply {
            color = Color.WHITE
            textSize = 20f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            isAntiAlias = true
            textAlign = Paint.Align.CENTER
        }

        val paintTick = Paint().apply {
            color = Color.parseColor("#888888")
            textSize = 18f
            isAntiAlias = true
            textAlign = Paint.Align.CENTER
        }

        val barTop = 15f
        val barBottom = 75f
        val barHeight = barBottom - barTop

        // Desenha os blocos do dia
        val ticks = ArrayList<Pair<Long, Float>>()

        for (i in 0 until eventsArray.length()) {
            val event = eventsArray.getJSONObject(i)
            val getReadyTime = event.getString("getReadyTime")
            val departureTime = event.getString("departureTime")
            val eventStartTime = event.getString("eventStartTime")
            val eventEndTime = event.getString("eventEndTime")
            val colorHex = event.getString("color")
            val summary = event.getString("summary")

            val readyPct = getPct(getReadyTime)
            val departPct = getPct(departureTime)
            val startPct = getPct(eventStartTime)
            val endPct = getPct(eventEndTime)

            // Parse date times for ticks
            val grTime = sdfParser.parse(getReadyTime)!!.time
            val depTime = sdfParser.parse(departureTime)!!.time
            val stTime = sdfParser.parse(eventStartTime)!!.time
            val enTime = sdfParser.parse(eventEndTime)!!.time

            ticks.add(Pair(grTime, readyPct))
            ticks.add(Pair(depTime, departPct))
            ticks.add(Pair(stTime, startPct))
            ticks.add(Pair(enTime, endPct))

            val leftBound = 0f
            val rightBound = width.toFloat()

            // 1. Se arrumar (Lilás #a855f7)
            if (departPct > readyPct) {
                val left = (readyPct / 100f) * width
                val right = (departPct / 100f) * width
                paintRect.color = Color.parseColor("#a855f7")
                val rect = RectF(left, barTop, right, barBottom)
                canvas.drawRoundRect(rect, 8f, 8f, paintRect)
                drawTextInside(canvas, "Se arrumar", rect, paintText)
            }

            // 2. Deslocamento (Laranja #f59e0b)
            if (startPct > departPct) {
                val left = (departPct / 100f) * width
                val right = (startPct / 100f) * width
                paintRect.color = Color.parseColor("#f59e0b")
                val rect = RectF(left, barTop, right, barBottom)
                canvas.drawRoundRect(rect, 0f, 0f, paintRect)
                drawTextInside(canvas, "Deslocamento", rect, paintText)
            }

            // 3. Appointment (Cor do evento)
            if (endPct > startPct) {
                val left = (startPct / 100f) * width
                val right = (endPct / 100f) * width
                paintRect.color = Color.parseColor(colorHex)
                val rect = RectF(left, barTop, right, barBottom)
                val radius = if (startPct > departPct) 0f else 8f
                canvas.drawRoundRect(rect, radius, radius, paintRect)
                drawTextInside(canvas, summary, rect, paintText)
            }
        }

        // Desenha régua de horários
        // Ordena e remove duplicados (com proximidade < 1 min)
        val sortedTicks = ticks.sortedBy { it.first }
        val uniqueTicks = ArrayList<Pair<Long, Float>>()
        for (tick in sortedTicks) {
            if (uniqueTicks.none { Math.abs(it.first - tick.first) < 60 * 1000 }) {
                uniqueTicks.add(tick)
            }
        }

        val sdfTime = SimpleDateFormat("HH:mm", Locale.getDefault()).apply {
            timeZone = TimeZone.getDefault()
        }

        for (idx in uniqueTicks.indices) {
            val tick = uniqueTicks[idx]
            val x = (tick.second / 100f) * width
            val label = sdfTime.format(Date(tick.first))

            paintTick.textAlign = when (idx) {
                0 -> Paint.Align.LEFT
                uniqueTicks.size - 1 -> Paint.Align.RIGHT
                else -> Paint.Align.CENTER
            }

            // Previne desenhar além das bordas
            val finalX = when (idx) {
                0 -> 4f
                uniqueTicks.size - 1 -> width - 4f
                else -> x
            }

            canvas.drawText(label, finalX, barBottom + 35f, paintTick)
        }

        return bitmap
    }

    private fun drawTextInside(canvas: Canvas, text: String, rect: RectF, paint: Paint) {
        val rectWidth = rect.width()
        if (rectWidth < 40f) return // Muito pequeno para ler qualquer coisa

        // Truncate text if needed
        var drawText = text
        val textWidth = paint.measureText(drawText)
        if (textWidth > rectWidth - 10f) {
            // Encontra tamanho do texto que cabe com reticências
            var len = drawText.length
            while (len > 1 && paint.measureText(drawText.substring(0, len) + "...") > rectWidth - 10f) {
                len--
            }
            drawText = if (len > 1) drawText.substring(0, len) + "..." else "..."
        }

        // Centraliza verticalmente
        val bounds = Rect()
        paint.getTextBounds(drawText, 0, drawText.length, bounds)
        val y = rect.centerY() + (bounds.height() / 2f)

        canvas.drawText(drawText, rect.centerX(), y, paint)
    }

    private fun drawPlaceholderBitmap(message: String): Bitmap {
        val width = 800
        val height = 160
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.TRANSPARENT)

        val paintText = Paint().apply {
            color = Color.parseColor("#888888")
            textSize = 24f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
            isAntiAlias = true
            textAlign = Paint.Align.CENTER
        }

        canvas.drawText(message, width / 2f, height / 2f, paintText)
        return bitmap
    }

    private fun drawErrorBitmap(error: String): Bitmap {
        val width = 800
        val height = 160
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.TRANSPARENT)

        val paintText = Paint().apply {
            color = Color.parseColor("#ff4d4d")
            textSize = 22f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            isAntiAlias = true
            textAlign = Paint.Align.CENTER
        }

        canvas.drawText("Erro: $error", width / 2f, height / 2f, paintText)
        return bitmap
    }
}
