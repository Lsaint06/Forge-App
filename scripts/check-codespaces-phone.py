"""Unauthenticated HTTPS checks for an existing Codespace's Expo endpoints."""
import json
import os
import sys
import urllib.parse
import urllib.request

name = os.environ.get("CODESPACE_NAME")
if not name:
    sys.exit("Run this check inside the Codespace after starting Metro.")
domain = os.environ.get("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN", "app.github.dev")
origin = f"https://{name}-8081.{domain}"
try:
    with urllib.request.urlopen(origin + "/status", timeout=30) as response:
        if response.read().decode().strip() != "packager-status:running":
            raise ValueError("The public URL did not return Metro status. Check port visibility.")
    request = urllib.request.Request(origin + "/", headers={
        "expo-platform": "ios", "accept": "application/expo+json"
    })
    with urllib.request.urlopen(request, timeout=60) as response:
        manifest = json.load(response)
    client = manifest["extra"]["expoClient"]
    if client["name"] != "FORGE" or client["sdkVersion"] != "58.0.0":
        raise ValueError("Unexpected app or SDK in public manifest")
    launch_url = manifest["launchAsset"]["url"]
    parsed = urllib.parse.urlsplit(launch_url)
    if parsed.scheme != "https" or parsed.hostname != urllib.parse.urlsplit(origin).hostname:
        raise ValueError("Bundle points to a different or non-HTTPS host")
    with urllib.request.urlopen(launch_url, timeout=120) as response:
        bundle = response.read()
        if not bundle or b"Your session." not in bundle:
            raise ValueError("Bundle did not contain the expected FORGE application")
    print("PASS: public HTTPS status, FORGE SDK 58 manifest and iOS bundle")
    print("Expo Go:", origin.replace("https://", "exps://", 1))
    print("Safari launch page:", f"https://{name}-8080.{domain}")
except Exception as error:
    sys.exit(f"Public check failed: {error}\nSet ports 8080/8081 to Public, keep their upstream protocol HTTP, and keep Metro running.")
