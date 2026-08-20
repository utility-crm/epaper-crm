package com.epaperspace.publisher

import android.app.Application
import com.epaperspace.publisher.di.appModules
import org.koin.android.ext.koin.androidContext
import org.koin.android.ext.koin.androidLogger
import org.koin.core.context.startKoin

class PublisherApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        startKoin {
            androidLogger()
            androidContext(this@PublisherApplication)
            modules(appModules)
        }
    }
}
