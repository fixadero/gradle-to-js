exports.expected = {
  "apply": [
    "plugin: \"com.android.application\"",
    "plugin: \"org.jetbrains.kotlin.android\"",
    "plugin: \"com.facebook.react\""
  ],
  "react": {},
  "enableProguardInReleaseBuilds": false,
  "jscFlavor": "io.github.react-native-community:jsc-android:2026004.+",
  "android": {
    "ndkVersion": "rootProject.ext.ndkVersion",
    "buildToolsVersion": "rootProject.ext.buildToolsVersion",
    "compileSdk": "rootProject.ext.compileSdkVersion",
    "namespace": "com.helloworld",
    "defaultConfig": {
      "applicationId": "com.helloworld",
      "minSdkVersion": "rootProject.ext.minSdkVersion",
      "targetSdkVersion": "rootProject.ext.targetSdkVersion",
      "versionCode": "1",
      "versionName": "1.0"
    },
    "signingConfigs": {
      "debug": {
        "storeFile": "file('debug.keystore')",
        "storePassword": "android",
        "keyAlias": "androiddebugkey",
        "keyPassword": "android"
      }
    },
    "buildTypes": {
      "debug": {
        "signingConfig": "signingConfigs.debug"
      },
      "release": {
        "signingConfig": "signingConfigs.debug",
        "minifyEnabled": "enableProguardInReleaseBuilds",
        "proguardFiles": "getDefaultProguardFile(\"proguard-android-optimize.txt\"), \"proguard-rules.pro\""
      }
    }
  },
  "dependencies": [
    {
      "group": "com.facebook.react",
      "name": "react-android",
      "version": "",
      "type": "implementation",
      "excludes": []
    },
    {
      "group": "com.facebook.react",
      "name": "hermes-android",
      "version": "",
      "type": "implementation",
      "excludes": []
    },
    {
      "group": "",
      "name": "jscFlavor",
      "version": "",
      "type": "implementation",
      "excludes": []
    }
  ]
};
