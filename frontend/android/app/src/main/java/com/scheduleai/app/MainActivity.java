package com.scheduleai.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(WidgetSettingsPlugin.class);
        registerPlugin(AppUpdatePlugin.class);
        
        // Start background 10-minute location tracking
        LocationTrackerReceiver.scheduleNextAlarm(this);
    }
}
