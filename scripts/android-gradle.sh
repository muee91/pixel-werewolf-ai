#!/bin/sh

set -eu

PROJECT_ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
ANDROID_DIR="$PROJECT_ROOT/android"

if [ -z "${JAVA_HOME:-}" ]; then
    if [ -x /opt/homebrew/opt/openjdk@21/bin/java ]; then
        JAVA_HOME=/opt/homebrew/opt/openjdk@21
        export JAVA_HOME
        PATH="$JAVA_HOME/bin:$PATH"
        export PATH
    elif command -v /usr/libexec/java_home >/dev/null 2>&1; then
        JAVA_HOME=$(/usr/libexec/java_home -v 21 2>/dev/null || true)
        if [ -n "$JAVA_HOME" ]; then
            export JAVA_HOME
            PATH="$JAVA_HOME/bin:$PATH"
            export PATH
        fi
    fi
fi

JAVA_MAJOR=$(java -version 2>&1 | awk -F '[\".]' '/version/ { print $2; exit }')
if [ "${JAVA_MAJOR:-0}" -lt 21 ]; then
    echo "Capacitor 8 Android 构建需要 JDK 21。请安装 OpenJDK 21 或设置 JAVA_HOME。" >&2
    exit 1
fi

cd "$ANDROID_DIR"
exec ./gradlew "$@"
