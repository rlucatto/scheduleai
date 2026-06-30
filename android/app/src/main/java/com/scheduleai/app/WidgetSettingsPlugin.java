package com.scheduleai.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "WidgetSettings")
public class WidgetSettingsPlugin extends Plugin {

    @PluginMethod
    public void saveBackendUrl(PluginCall call) {
        String url = call.getString("url");
        if (url != null) {
            SharedPreferences prefs = getContext().getSharedPreferences("WidgetPrefs", Context.MODE_PRIVATE);
            prefs.edit().putString("backend_url", url).apply();
            
            // Trigger widget update broadcast to refresh immediately
            Intent intent = new Intent(getContext(), ScheduleWidgetProvider.class);
            intent.setAction(ScheduleWidgetProvider.ACTION_REFRESH_WIDGET);
            getContext().sendBroadcast(intent);
            
            call.resolve();
        } else {
            call.reject("URL is null");
        }
    }
}
