exports.expected = {
  "buildscript": {
    "repositories": [
      {
        "type": "unknown",
        "data": {
          "name": "google()"
        }
      },
      {
        "type": "unknown",
        "data": {
          "name": "mavenCentral()"
        }
      }
    ],
    "dependencies": [
      {
        "group": "com.android.tools.build",
        "name": "gradle",
        "version": "",
        "type": "classpath",
        "excludes": []
      },
      {
        "group": "com.facebook.react",
        "name": "react-native-gradle-plugin",
        "version": "",
        "type": "classpath",
        "excludes": []
      },
      {
        "group": "",
        "name": "kotlinVersion = findProperty('android.kotlinVersion')",
        "version": "",
        "type": "def",
        "excludes": []
      },
      {
        "group": "org.jetbrains.kotlin",
        "name": "kotlin-gradle-plugin",
        "version": "$kotlinVersion",
        "type": "classpath",
        "excludes": []
      }
    ]
  },
  "allprojects": {
    "repositories": [
      {
        "type": "unknown",
        "data": {
          "name": "google()"
        }
      },
      {
        "type": "unknown",
        "data": {
          "name": "mavenCentral()"
        }
      },
      {
        "type": "maven",
        "data": {
          "url": "https://www.jitpack.io"
        }
      }
    ]
  },
  "apply": [
    "plugin: \"expo-root-project\"",
    "plugin: \"com.facebook.react.rootproject\""
  ]
};
