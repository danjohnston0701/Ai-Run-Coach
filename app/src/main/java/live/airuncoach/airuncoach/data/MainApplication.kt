package live.airuncoach.airuncoach.data

import android.app.Application

class MainApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        SessionManager(applicationContext)
    }
}
