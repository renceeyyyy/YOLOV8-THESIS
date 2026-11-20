import os
import json
import time
import threading
from datetime import datetime
import cv2
import numpy as np
from flask import Flask, Response, jsonify, request
from ultralytics import YOLO

app = Flask(__name__, static_folder='.', static_url_path='')

# ============================================================================
# --- CONFIGURATION ---
# ============================================================================
MODEL_PATH = 'best.pt'
SHRIMP_DATA_FILE = 'shrimp_data.json'

# Static local IP addresses of your 3 ESP32-CAM modules (Port 81 /stream)
CAMERAS = {
    "cam1": "http://192.168.100.101:81/stream",
    "cam2": "http://192.168.100.102:81/stream",
    "cam3": "http://192.168.100.103:81/stream"

}

CAMERA_LABELS = {
    "cam1": "Cam 1",
    "cam2": "Cam 2",
    "cam3": "Cam 3"
}

CONF_THRESHOLD = 0.60
CONSECUTIVE_FRAMES_REQUIRED = 5   # Require 5 consecutive waste frames before triggering pump
PUMP_COOLDOWN_SECONDS = 60        # Minimum seconds between automated suction cycles
SUCTION_DURATION_SECONDS = 10     # How long Pump 3 runs per waste detection trigger
BIOFLOC_INCREMENT_PCT = 10        # +10% reservoir level per suction transfer

# Ideal Water Parameters (Penaeus vannamei / Shrimp Aquaculture)
PH_MIN, PH_MAX = 7.5, 8.5
TEMP_MIN, TEMP_MAX = 28.0, 32.0

# Load YOLOv8 custom model safely
if os.path.exists(MODEL_PATH):
    model = YOLO(MODEL_PATH)
    MODEL_LOADED = True
else:
    print(f"[WARNING] '{MODEL_PATH}' not found in {os.getcwd()}. Running in telemetry-only mode.")
    model = None
    MODEL_LOADED = False

# ============================================================================
# --- SHRIMP POPULATION PERSISTENCE HELPERS ---
# ============================================================================
def default_shrimp_metrics():
    return {
        "daysRunning": 14,
        "totalStocked": 50,
        "alive": 48,
        "dead": 2,
        "chartLabels": ["Day 1", "Day 3", "Day 5", "Day 7", "Day 9", "Day 12", "Day 14"],
        "aliveHistory": [50, 50, 49, 49, 48, 48, 48],
        "deadHistory": [0, 0, 1, 1, 2, 2, 2],
        "logs": [
            {
                "action": "dead",
                "count": 1,
                "note": "Routine morning check",
                "time": "Day 9 • 08:30 AM",
                "aliveAfter": 48,
                "deadAfter": 2,
                "stockedAfter": 50
            },
            {
                "action": "dead",
                "count": 1,
                "note": "Molting stress observed",
                "time": "Day 5 • 09:15 AM",
                "aliveAfter": 49,
                "deadAfter": 1,
                "stockedAfter": 50
            }
        ]
    }


def load_shrimp_metrics():
    if os.path.exists(SHRIMP_DATA_FILE):
        try:
            with open(SHRIMP_DATA_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, dict) and "alive" in data and "dead" in data:
                    return data
        except Exception as e:
            print(f"[WARNING] Failed to load {SHRIMP_DATA_FILE}: {e}")
    return default_shrimp_metrics()


def save_shrimp_metrics(metrics_dict):
    try:
        with open(SHRIMP_DATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(metrics_dict, f, indent=2)
    except Exception as e:
        print(f"[WARNING] Failed to save {SHRIMP_DATA_FILE}: {e}")


# ============================================================================
# --- THREAD-SAFE SYSTEM STATE & INFERENCE LOCK ---
# ============================================================================
state_lock = threading.Lock()
yolo_lock = threading.Lock()  # Prevents concurrent thread collisions inside YOLO model()

system_state = {
    "ph": 7.9,
    "temp": 29.4,
    "bioflocLevel": 20,
    "bioflocTransfers": 0,
    "lastTransferTime": "--",
    "devices": {
        "esp32": False,
        "cam1": False,
        "cam2": False,
        "cam3": False,
        "camera": False,  # True if at least 1 camera is online
        "wifi": True
    },
    "lastEsp32Ping": "Waiting...",
    "lastEsp32Timestamp": 0.0,
    "lastCameraTimestamps": {
        "cam1": 0.0,
        "cam2": 0.0,
        "cam3": 0.0
    },
    "detection": {
        "type": "clear",
        "confidence": 0,
        "activeCamera": "none",
        "action": "Camera feeds analyzed by YOLOv8 model",
        "cameras": {
            "cam1": {
                "online": False,
                "type": "clear",
                "confidence": 0,
                "action": "Waiting for Cam 1 stream"
            },
            "cam2": {
                "online": False,
                "type": "clear",
                "confidence": 0,
                "action": "Waiting for Cam 2 stream"
            },
            "cam3": {
                "online": False,
                "type": "clear",
                "confidence": 0,
                "action": "Waiting for Cam 3 stream"
            }
        }
    },
    "pendingCommands": {
        "trigger_suction": False,
        "suction_duration_sec": SUCTION_DURATION_SECONDS
    },
    "alerts": [
        {
            "type": "info",
            "message": "Smart AquaGuard server initialized (3-Camera Mode) — waiting for hardware",
            "status": "Active",
            "time": datetime.now().strftime("%I:%M %p")
        }
    ],
    "transferHistory": [],
    "telemetryHistory": {
        "labels": ["Init"],
        "ph": [7.9],
        "temp": [29.4]
    },
    "shrimpMetrics": load_shrimp_metrics()
}

consecutive_waste_frames = {
    "cam1": 0,
    "cam2": 0,
    "cam3": 0
}
last_pump_trigger_time = 0.0
last_alert_timestamps = {}


def push_alert(alert_type: str, message: str, status: str = "Active", cooldown: int = 120):
    """Adds an alert to the top of the log while preventing duplicate spam."""
    now_ts = time.time()
    if message in last_alert_timestamps and (now_ts - last_alert_timestamps[message]) < cooldown:
        return
    last_alert_timestamps[message] = now_ts

    system_state["alerts"].insert(0, {
        "type": alert_type,
        "message": message,
        "status": status,
        "time": datetime.now().strftime("%I:%M %p")
    })
    system_state["alerts"] = system_state["alerts"][:30]


def is_waste_class(class_name: str) -> bool:
    """Checks if the detected YOLO class represents feed waste, shrimp waste, or turbidity."""
    name = class_name.lower().strip()
    if name in ("clear", "shrimp"):
        return False
    return any(keyword in name for keyword in ["waste", "feed", "turbid", "dirt", "pellet"])


def create_placeholder_frame(cam_id: str, status_text: str):
    """Generates a clean fallback JPEG frame when an ESP32-CAM is offline."""
    label = CAMERA_LABELS.get(cam_id, cam_id.upper())
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    img[:] = (27, 43, 32)
    cv2.putText(img, f"Smart AquaGuard - {label} Offline", (95, 220),
                cv2.FONT_HERSHEY_SIMPLEX, 0.85, (255, 255, 255), 2)
    cv2.putText(img, status_text, (115, 260),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (168, 195, 184), 1)
    ret, buffer = cv2.imencode('.jpg', img)
    return buffer.tobytes() if ret else b""


def refresh_overall_detection_locked():
    """Recomputes top-level detection summary across cam1, cam2, and cam3 (must be called under state_lock)."""
    cams = system_state["detection"]["cameras"]
    any_online = any(
        system_state["devices"][cid] for cid in ("cam1", "cam2", "cam3")
    )
    system_state["devices"]["camera"] = any_online

    best_cam = None
    best_conf = -1
    for cid in ("cam1", "cam2", "cam3"):
        c_state = cams[cid]
        if c_state["type"] == "waste" and c_state["confidence"] > best_conf:
            best_conf = c_state["confidence"]
            best_cam = cid

    if best_cam is not None:
        system_state["detection"]["type"] = "waste"
        system_state["detection"]["confidence"] = best_conf
        system_state["detection"]["activeCamera"] = best_cam
        system_state["detection"]["action"] = cams[best_cam]["action"]
    else:
        system_state["detection"]["type"] = "clear"
        system_state["detection"]["confidence"] = 0
        system_state["detection"]["activeCamera"] = "none"
        system_state["detection"]["action"] = "Camera feeds analyzed by YOLOv8 model"


# ============================================================================
# --- VIDEO STREAMING & YOLOV8 INFERENCE (PER CAMERA) ---
# ============================================================================
def generate_frames(cam_id: str):
    global last_pump_trigger_time

    stream_url = CAMERAS[cam_id]
    cam_label = CAMERA_LABELS.get(cam_id, cam_id.upper())
    cap = cv2.VideoCapture(stream_url)

    while True:
        success, frame = cap.read()
        if not success:
            with state_lock:
                system_state["devices"][cam_id] = False
                system_state["detection"]["cameras"][cam_id]["online"] = False
                system_state["detection"]["cameras"][cam_id]["type"] = "clear"
                system_state["detection"]["cameras"][cam_id]["confidence"] = 0
                system_state["detection"]["cameras"][cam_id]["action"] = f"{cam_label} offline"
                refresh_overall_detection_locked()

            placeholder = create_placeholder_frame(cam_id, f"Waiting for stream at {stream_url}")
            if placeholder:
                yield (
                    b'--frame\r\n'
                    b'Content-Type: image/jpeg\r\n\r\n' + placeholder + b'\r\n'
                )
            time.sleep(1.5)
            cap.release()
            cap = cv2.VideoCapture(stream_url)
            continue

        now_ts = time.time()
        waste_detected = False
        top_conf = 0

        if MODEL_LOADED and model is not None:
            with yolo_lock:
                results = model(frame, conf=CONF_THRESHOLD, verbose=False)
            annotated_frame = results[0].plot()

            if results[0].boxes is not None and len(results[0].boxes) > 0:
                for box in results[0].boxes:
                    cls_id = int(box.cls.item())
                    cls_name = model.names[cls_id]
                    conf_pct = int(box.conf.item() * 100)
                    if is_waste_class(cls_name) and conf_pct > top_conf:
                        waste_detected = True
                        top_conf = conf_pct
        else:
            annotated_frame = frame

        # Overlay camera label on top-left corner of frame
        cv2.putText(annotated_frame, cam_label, (14, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)

        with state_lock:
            system_state["devices"][cam_id] = True
            system_state["lastCameraTimestamps"][cam_id] = now_ts
            cam_det = system_state["detection"]["cameras"][cam_id]
            cam_det["online"] = True

            if waste_detected:
                consecutive_waste_frames[cam_id] += 1
                cam_det["type"] = "waste"
                cam_det["confidence"] = top_conf
                cam_det["action"] = f"[{cam_label}] Waste detected — verifying extraction trigger"

                if (
                    consecutive_waste_frames[cam_id] >= CONSECUTIVE_FRAMES_REQUIRED
                    and (now_ts - last_pump_trigger_time) >= PUMP_COOLDOWN_SECONDS
                ):
                    last_pump_trigger_time = now_ts
                    consecutive_waste_frames[cam_id] = 0

                    system_state["pendingCommands"]["trigger_suction"] = True
                    cam_det["action"] = f"[{cam_label}] Pump triggered — waste transferred to biofloc"

                    new_level = min(100, system_state["bioflocLevel"] + BIOFLOC_INCREMENT_PCT)
                    system_state["bioflocLevel"] = new_level
                    system_state["bioflocTransfers"] += 1

                    now_dt = datetime.now()
                    time_str = now_dt.strftime("%I:%M %p")
                    date_str = now_dt.strftime("%b %d")
                    system_state["lastTransferTime"] = time_str

                    system_state["transferHistory"].insert(0, {
                        "date": date_str,
                        "time": time_str,
                        "confidence": top_conf,
                        "camera": cam_label
                    })
                    system_state["transferHistory"] = system_state["transferHistory"][:25]

                    push_alert(
                        "info",
                        f"[{cam_label}] Feed waste detected ({top_conf}%) — suction pump triggered",
                        "Resolved",
                        cooldown=30
                    )
            else:
                consecutive_waste_frames[cam_id] = 0
                cam_det["type"] = "clear"
                cam_det["confidence"] = 0
                cam_det["action"] = f"[{cam_label}] Camera feed analyzed by YOLOv8 model"

            refresh_overall_detection_locked()

        ret, buffer = cv2.imencode('.jpg', annotated_frame)
        if not ret:
            continue

        yield (
            b'--frame\r\n'
            b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n'
        )


# ============================================================================
# --- WEB & API ROUTES ---
# ============================================================================
@app.route('/')
def index():
    return app.send_static_file('index.html')


@app.route('/video_feed')
def video_feed_default():
    """Backward-compatible default route pointing to cam1."""
    return Response(generate_frames("cam1"), mimetype='multipart/x-mixed-replace; boundary=frame')


@app.route('/video_feed/<cam_id>')
def video_feed_camera(cam_id: str):
    """Per-camera live annotated MJPEG stream endpoint (/video_feed/cam1, cam2, cam3)."""
    cid = cam_id.lower().strip()
    if cid not in CAMERAS:
        return jsonify({"status": "error", "message": f"Unknown camera '{cam_id}'"}), 404
    return Response(generate_frames(cid), mimetype='multipart/x-mixed-replace; boundary=frame')


@app.route('/api/status', methods=['GET'])
def api_status():
    """Endpoint polled by feed-detection.js every 2 seconds."""
    now_ts = time.time()
    with state_lock:
        for cid in ("cam1", "cam2", "cam3"):
            last_ts = system_state["lastCameraTimestamps"][cid]
            if last_ts > 0 and (now_ts - last_ts) > 10:
                system_state["devices"][cid] = False
                system_state["detection"]["cameras"][cid]["online"] = False
        refresh_overall_detection_locked()
        return jsonify(system_state["detection"])


@app.route('/api/dashboard', methods=['GET'])
def api_dashboard():
    """Unified state endpoint polled by all dashboard pages."""
    now_ts = time.time()
    with state_lock:
        if system_state["lastEsp32Timestamp"] > 0 and (now_ts - system_state["lastEsp32Timestamp"]) > 15:
            system_state["devices"]["esp32"] = False

        for cid in ("cam1", "cam2", "cam3"):
            last_ts = system_state["lastCameraTimestamps"][cid]
            if last_ts > 0 and (now_ts - last_ts) > 10:
                system_state["devices"][cid] = False
                system_state["detection"]["cameras"][cid]["online"] = False

        refresh_overall_detection_locked()

        return jsonify({
            "ph": system_state["ph"],
            "temp": system_state["temp"],
            "bioflocLevel": system_state["bioflocLevel"],
            "bioflocTransfers": system_state["bioflocTransfers"],
            "lastTransferTime": system_state["lastTransferTime"],
            "devices": system_state["devices"],
            "lastEsp32Ping": system_state["lastEsp32Ping"],
            "detection": system_state["detection"],
            "alerts": system_state["alerts"],
            "transferHistory": system_state["transferHistory"],
            "telemetryHistory": system_state["telemetryHistory"],
            "shrimpMetrics": system_state["shrimpMetrics"]
        })


@app.route('/api/shrimp', methods=['GET', 'POST'])
def api_shrimp():
    """Endpoint for reading and manually updating Shrimp Population & Mortality metrics."""
    if request.method == 'GET':
        with state_lock:
            return jsonify(system_state["shrimpMetrics"])

    payload = request.get_json(silent=True) or {}
    action = str(payload.get("action", "")).strip().lower()

    with state_lock:
        sm = system_state["shrimpMetrics"]
        now_label = datetime.now().strftime("%b %d • %I:%M %p")
        chart_label = datetime.now().strftime("%b %d")

        if action == "dead":
            count = int(payload.get("count", 0))
            note = str(payload.get("note", "")).strip() or "Manual mortality log"
            if count <= 0:
                return jsonify({"status": "error", "message": "Count must be greater than 0"}), 400
            if count > sm["alive"]:
                return jsonify({"status": "error", "message": f"Cannot log {count} dead; only {sm['alive']} alive"}), 400

            sm["alive"] -= count
            sm["dead"] += count

            if sm["chartLabels"] and sm["chartLabels"][-1] == chart_label:
                sm["aliveHistory"][-1] = sm["alive"]
                sm["deadHistory"][-1] = sm["dead"]
            else:
                sm["chartLabels"].append(chart_label)
                sm["aliveHistory"].append(sm["alive"])
                sm["deadHistory"].append(sm["dead"])
                if len(sm["chartLabels"]) > 12:
                    sm["chartLabels"].pop(0)
                    sm["aliveHistory"].pop(0)
                    sm["deadHistory"].pop(0)

            sm["logs"].insert(0, {
                "action": "dead",
                "count": count,
                "note": note,
                "time": now_label,
                "aliveAfter": sm["alive"],
                "deadAfter": sm["dead"],
                "stockedAfter": sm["totalStocked"]
            })
            sm["logs"] = sm["logs"][:30]
            save_shrimp_metrics(sm)
            push_alert("warning", f"Manual log: {count} dead shrimp recorded ({sm['alive']} alive remaining)", "Active", cooldown=5)
            return jsonify({"status": "ok", "shrimpMetrics": sm})

        elif action == "add":
            count = int(payload.get("count", 0))
            note = str(payload.get("note", "")).strip() or "Added new shrimp stock"
            if count <= 0:
                return jsonify({"status": "error", "message": "Count must be greater than 0"}), 400

            sm["alive"] += count
            sm["totalStocked"] += count

            if sm["chartLabels"] and sm["chartLabels"][-1] == chart_label:
                sm["aliveHistory"][-1] = sm["alive"]
                sm["deadHistory"][-1] = sm["dead"]
            else:
                sm["chartLabels"].append(chart_label)
                sm["aliveHistory"].append(sm["alive"])
                sm["deadHistory"].append(sm["dead"])
                if len(sm["chartLabels"]) > 12:
                    sm["chartLabels"].pop(0)
                    sm["aliveHistory"].pop(0)
                    sm["deadHistory"].pop(0)

            sm["logs"].insert(0, {
                "action": "add",
                "count": count,
                "note": note,
                "time": now_label,
                "aliveAfter": sm["alive"],
                "deadAfter": sm["dead"],
                "stockedAfter": sm["totalStocked"]
            })
            sm["logs"] = sm["logs"][:30]
            save_shrimp_metrics(sm)
            push_alert("success", f"Manual log: +{count} new shrimp added ({sm['alive']} total alive)", "Resolved", cooldown=5)
            return jsonify({"status": "ok", "shrimpMetrics": sm})

        elif action == "undo":
            if not sm["logs"]:
                return jsonify({"status": "error", "message": "No log entry to undo"}), 400
            last_entry = sm["logs"].pop(0)
            cnt = int(last_entry.get("count", 0))
            if last_entry.get("action") == "dead":
                sm["alive"] += cnt
                sm["dead"] = max(0, sm["dead"] - cnt)
            elif last_entry.get("action") == "add":
                sm["alive"] = max(0, sm["alive"] - cnt)
                sm["totalStocked"] = max(sm["alive"] + sm["dead"], sm["totalStocked"] - cnt)

            if sm["aliveHistory"]:
                sm["aliveHistory"][-1] = sm["alive"]
            if sm["deadHistory"]:
                sm["deadHistory"][-1] = sm["dead"]

            save_shrimp_metrics(sm)
            return jsonify({"status": "ok", "shrimpMetrics": sm})

        elif action == "reset":
            initial_count = max(1, int(payload.get("initialStock", 50)))
            days_running = max(1, int(payload.get("daysRunning", 1)))
            sm = {
                "daysRunning": days_running,
                "totalStocked": initial_count,
                "alive": initial_count,
                "dead": 0,
                "chartLabels": [f"Day {days_running}"],
                "aliveHistory": [initial_count],
                "deadHistory": [0],
                "logs": [
                    {
                        "action": "add",
                        "count": initial_count,
                        "note": f"Baseline stock initialized (Day {days_running})",
                        "time": now_label,
                        "aliveAfter": initial_count,
                        "deadAfter": 0,
                        "stockedAfter": initial_count
                    }
                ]
            }
            system_state["shrimpMetrics"] = sm
            save_shrimp_metrics(sm)
            return jsonify({"status": "ok", "shrimpMetrics": sm})

        return jsonify({"status": "error", "message": "Invalid action"}), 400


@app.route('/api/telemetry', methods=['POST'])
def api_telemetry():
    """Endpoint where Main ESP32 posts pH, Temp, and P45 Float Switch status and receives pump commands."""
    data = request.get_json(silent=True) or {}
    now_dt = datetime.now()
    time_str = now_dt.strftime("%I:%M %p")

    with state_lock:
        system_state["devices"]["esp32"] = True
        system_state["devices"]["wifi"] = True
        system_state["lastEsp32Timestamp"] = time.time()
        system_state["lastEsp32Ping"] = time_str

        if "ph" in data and data["ph"] is not None:
            ph_val = round(float(data["ph"]), 2)
            system_state["ph"] = ph_val
            if ph_val < PH_MIN:
                push_alert("warning", f"Low pH ({ph_val}) — pH Up dosing pump activated", "Active")
            elif ph_val > PH_MAX:
                push_alert("warning", f"High pH ({ph_val}) — pH Down dosing pump activated", "Active")

        if "temp" in data and data["temp"] is not None:
            temp_val = round(float(data["temp"]), 1)
            if temp_val > -50:
                system_state["temp"] = temp_val
                if temp_val > TEMP_MAX:
                    push_alert("warning", f"High temperature ({temp_val} °C) detected", "Active")
                elif temp_val < TEMP_MIN:
                    push_alert("warning", f"Low temperature ({temp_val} °C) detected", "Active")

        if data.get("float_full") is True:
            system_state["bioflocLevel"] = 100
            push_alert(
                "warning",
                "Biofloc reservoir full (P45 triggered) — return pump activated",
                "Resolved",
                cooldown=45
            )
        elif data.get("return_completed") is True:
            system_state["bioflocLevel"] = 25
            push_alert("success", "Filtered water returned to aquarium — reservoir at 25%", "Resolved", cooldown=30)

        hist = system_state["telemetryHistory"]
        if len(hist["labels"]) == 1 and hist["labels"][0] == "Init":
            hist["labels"].clear()
            hist["ph"].clear()
            hist["temp"].clear()

        hist["labels"].append(time_str)
        hist["ph"].append(system_state["ph"])
        hist["temp"].append(system_state["temp"])
        if len(hist["labels"]) > 12:
            hist["labels"].pop(0)
            hist["ph"].pop(0)
            hist["temp"].pop(0)

        command_payload = {
            "status": "ok",
            "trigger_suction": system_state["pendingCommands"]["trigger_suction"],
            "suction_duration_sec": system_state["pendingCommands"]["suction_duration_sec"]
        }
        system_state["pendingCommands"]["trigger_suction"] = False

        return jsonify(command_payload)


@app.route('/api/test-trigger', methods=['POST'])
def api_test_trigger():
    """Manual test endpoint to simulate a YOLOv8 suction trigger during testing/defense."""
    with state_lock:
        system_state["pendingCommands"]["trigger_suction"] = True
        system_state["bioflocLevel"] = min(100, system_state["bioflocLevel"] + BIOFLOC_INCREMENT_PCT)
        system_state["bioflocTransfers"] += 1
        now_dt = datetime.now()
        time_str = now_dt.strftime("%I:%M %p")
        system_state["lastTransferTime"] = time_str
        system_state["transferHistory"].insert(0, {
            "date": now_dt.strftime("%b %d"),
            "time": time_str,
            "confidence": 95,
            "camera": "Manual Test"
        })
        push_alert("info", "Manual test trigger — suction pump queued", "Resolved", cooldown=5)
        return jsonify({"status": "queued", "bioflocLevel": system_state["bioflocLevel"]})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)