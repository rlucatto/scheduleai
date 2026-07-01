package com.scheduleai.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import androidx.core.content.ContextCompat;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Calendar;

public class LocationTrackerReceiver extends BroadcastReceiver {
    private static final String TAG = "LocationTracker";

    @Override
    public void onReceive(final Context context, Intent intent) {
        Log.d(TAG, "LocationTrackerReceiver triggered!");

        // 1. Reschedule the next alarm immediately
        scheduleNextAlarm(context);

        // 2. Query location and post to backend
        acquireLocationAndPost(context);
    }

    public static void scheduleNextAlarm(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) {
            Log.e(TAG, "AlarmManager is null.");
            return;
        }

        Intent intent = new Intent(context, LocationTrackerReceiver.class);
        
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        
        PendingIntent pendingIntent = PendingIntent.getBroadcast(context, 1001, intent, flags);

        // Calculate next even minute boundary (e.g. :00, :02, :04, ... :58)
        Calendar calendar = Calendar.getInstance();
        int minute = calendar.get(Calendar.MINUTE);
        int nextMinute;
        if (minute % 2 == 0) {
            nextMinute = minute + 2;
        } else {
            nextMinute = minute + 1;
        }
        
        calendar.set(Calendar.MINUTE, nextMinute >= 60 ? nextMinute - 60 : nextMinute);
        calendar.set(Calendar.SECOND, 0);
        calendar.set(Calendar.MILLISECOND, 0);

        if (nextMinute >= 60) {
            calendar.add(Calendar.HOUR_OF_DAY, 1);
        }

        long triggerAtMillis = calendar.getTimeInMillis();
        Log.d(TAG, "Scheduling next alarm for: " + calendar.getTime().toString() + " (" + triggerAtMillis + " ms)");

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (alarmManager.canScheduleExactAlarms()) {
                    alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent);
                } else {
                    Log.w(TAG, "Cannot schedule exact alarms. Falling back to inexact setAndAllowWhileIdle.");
                    alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent);
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent);
            } else {
                alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent);
            }
        } catch (SecurityException e) {
            Log.e(TAG, "SecurityException scheduling exact alarm. Falling back to inexact alarm.", e);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent);
            } else {
                alarmManager.set(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent);
            }
        }
    }

    private void acquireLocationAndPost(final Context context) {
        if (ContextCompat.checkSelfPermission(context, android.Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            Log.e(TAG, "Location permission NOT granted. Cannot track background location.");
            return;
        }

        final LocationManager locationManager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        if (locationManager == null) {
            Log.e(TAG, "LocationManager is null.");
            return;
        }

        // Try getting last known location first as a quick fallback
        Location bestLocation = null;
        try {
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                bestLocation = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            }
            if (bestLocation == null && locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                bestLocation = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
            }
        } catch (SecurityException ignored) {}

        if (bestLocation != null && (System.currentTimeMillis() - bestLocation.getTime() < 30 * 1000)) {
            // Last known location is very fresh (less than 30 seconds old)
            Log.d(TAG, "Using fresh last known location: " + bestLocation.getLatitude() + ", " + bestLocation.getLongitude());
            postLocation(context, bestLocation.getLatitude(), bestLocation.getLongitude());
            return;
        }

        // Otherwise request a fresh location update
        final Location[] locationHolder = new Location[1];
        final LocationListener listener = new LocationListener() {
            @Override
            public void onLocationChanged(Location location) {
                if (location != null) {
                    locationHolder[0] = location;
                    Log.d(TAG, "Received location update: " + location.getLatitude() + ", " + location.getLongitude());
                    postLocation(context, location.getLatitude(), location.getLongitude());
                    try {
                        locationManager.removeUpdates(this);
                    } catch (SecurityException ignored) {}
                }
            }
            @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
            @Override public void onProviderEnabled(String provider) {}
            @Override public void onProviderDisabled(String provider) {}
        };

        try {
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 0, 0, listener, Looper.getMainLooper());
            } else if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 0, 0, listener, Looper.getMainLooper());
            }
        } catch (SecurityException e) {
            Log.e(TAG, "SecurityException requesting location updates", e);
        }

        // Fail-safe: if we don't get a location update within 15 seconds, use the last known location or cancel
        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override
            public void run() {
                if (locationHolder[0] == null) {
                    Log.w(TAG, "GPS timeout. Checking last known location fallback.");
                    try {
                        locationManager.removeUpdates(listener);
                    } catch (SecurityException ignored) {}
                    
                    Location fallbackLoc = null;
                    try {
                        if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                            fallbackLoc = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);
                        }
                        if (fallbackLoc == null && locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                            fallbackLoc = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
                        }
                    } catch (SecurityException ignored) {}

                    if (fallbackLoc != null) {
                        Log.d(TAG, "GPS timeout. Using fallback last known location: " + fallbackLoc.getLatitude() + ", " + fallbackLoc.getLongitude());
                        postLocation(context, fallbackLoc.getLatitude(), fallbackLoc.getLongitude());
                    } else {
                        Log.e(TAG, "GPS timeout and no last known location available.");
                    }
                }
            }
        }, 15000);
    }

    private void postLocation(final Context context, final double latitude, final double longitude) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection conn = null;
                try {
                    SharedPreferences prefs = context.getSharedPreferences("WidgetPrefs", Context.MODE_PRIVATE);
                    String backendUrl = prefs.getString("backend_url", "https://scheduleai-hz68.onrender.com");
                    URL url = new URL(backendUrl + "/api/location/track");
                    Log.d(TAG, "Posting background location to: " + url.toString() + " | coords: " + latitude + ", " + longitude);
                    
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setRequestProperty("Content-Type", "application/json");
                    conn.setDoOutput(true);
                    conn.setConnectTimeout(8000);
                    conn.setReadTimeout(8000);

                    String json = "{\"latitude\":" + latitude + ",\"longitude\":" + longitude + ",\"observations\":\"Alarme de Segundo Plano (10 min)\"}";
                    byte[] out = json.getBytes(StandardCharsets.UTF_8);

                    OutputStream os = conn.getOutputStream();
                    os.write(out);
                    os.flush();
                    os.close();

                    int responseCode = conn.getResponseCode();
                    Log.d(TAG, "Background location post HTTP code: " + responseCode);
                } catch (Exception e) {
                    Log.e(TAG, "Error posting background location", e);
                } finally {
                    if (conn != null) {
                        conn.disconnect();
                    }
                }
            }
        }).start();
    }
}
