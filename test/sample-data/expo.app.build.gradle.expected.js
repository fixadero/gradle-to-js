exports.expected = {
  "apply": [
    "plugin: \"com.android.application\"",
    "plugin: \"org.jetbrains.kotlin.android\"",
    "plugin: \"com.facebook.react\""
  ],
  "projectRoot": "rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()",
  "react": {
    "entryFile": "file([\"node\", \"-e\", \"require('expo/scripts/resolveAppEntry')\", projectRoot, \"android\", \"absolute\"].execute(null, rootDir).text.trim())",
    "reactNativeDir": "new File([\"node\", \"--print\", \"require.resolve('react-native/package.json')\"].execute(null, rootDir).text.trim()).getParentFile().getAbsoluteFile()",
    "hermesCommand": {
      "paths:": [
        "require.resolve('react-native/package.json')"
      ]
    },
    "codegenDir": {
      "paths:": [
        "require.resolve('react-native/package.json')"
      ]
    },
    "enableBundleCompression": "(findProperty('android.enableBundleCompression') ?: false).toBoolean()",
    "cliFile": {
      "paths:": [
        "require.resolve('expo/package.json')"
      ]
    },
    "bundleCommand": "export:embed"
  },
  "enableMinifyInReleaseBuilds": "(findProperty('android.enableMinifyInReleaseBuilds') ?: false).toBoolean()",
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
      "versionName": "1.0",
      "buildConfigField": {}
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
        "enableShrinkResources": "findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'",
        "shrinkResources": "enableShrinkResources.toBoolean()",
        "minifyEnabled": "enableMinifyInReleaseBuilds",
        "proguardFiles": "getDefaultProguardFile(\"proguard-android-optimize.txt\"), \"proguard-rules.pro\"",
        "enablePngCrunchInRelease": "findProperty('android.enablePngCrunchInReleaseBuilds') ?: 'true'",
        "crunchPngs": "enablePngCrunchInRelease.toBoolean()"
      }
    },
    "packagingOptions": {
      "jniLibs": {
        "enableLegacyPackaging": "findProperty('expo.useLegacyPackaging') ?: 'false'",
        "useLegacyPackaging": "enableLegacyPackaging.toBoolean()"
      }
    },
    "androidResources": {
      "ignoreAssetsPattern": "!.svn:!.git:!.ds_store:!*.scc:!CVS:!thumbs.db:!picasa.ini:!*~"
    }
  },
  "[\"pickFirsts\",": {
    "prop": "->",
    "options": [
      "(findProperty(\"android.packagingOptions.$prop\") ?: \"\").split(\",\");",
      "-= \"\""
    ],
    "for": "(i in 0..<options.size()) options[i] = options[i].trim();"
  },
  "dependencies": [
    {
      "group": "",
      "name": "\"com.facebook.react:react-android\"",
      "version": "",
      "type": "implementation",
      "excludes": []
    },
    {
      "group": "",
      "name": "isGifEnabled = (findProperty('expo.gif.enabled') ?: \"\") == \"true\";",
      "version": "",
      "type": "def",
      "excludes": []
    },
    {
      "group": "",
      "name": "isWebpEnabled = (findProperty('expo.webp.enabled') ?: \"\") == \"true\";",
      "version": "",
      "type": "def",
      "excludes": []
    },
    {
      "group": "",
      "name": "isWebpAnimatedEnabled = (findProperty('expo.webp.animated') ?: \"\") == \"true\";",
      "version": "",
      "type": "def",
      "excludes": []
    },
    {
      "group": "",
      "name": "d",
      "version": "",
      "type": "if",
      "excludes": []
    }
  ],
  "": {
    "implementation": "jscFlavor"
  }
};
