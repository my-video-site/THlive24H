from flask import Flask, jsonify, request
from flask_cors import CORS
import logging

from pornhub_api import PornhubApi

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO)

api = PornhubApi()
print("API LOADED")

# =========================
# ADAPTER (ของจริง)
# =========================
def external_search(query):
    results = api.search_videos.search_videos(query)

    data = []
    for v in results:
        data.append({
            "id": v.video_id,
            "title": v.title,
            "url": v.url,
            "thumb": v.default_thumb
        })
    return data


def external_get_video(video_id):
    try:
        v = api.video.get_by_id(video_id)
        return {
            "id": v.video_id,
            "title": v.title,
            "url": v.url,
            "thumb": v.default_thumb
        }
    except:
        return None


def external_categories():
    return [c.name for c in api.video.categories()]


def external_tags(query):
    return [t.name for t in api.video.tags(query)]


# =========================
# UTIL
# =========================
def paginate(items, page, limit):
    page = max(int(page or 1), 1)
    limit = max(min(int(limit or 20), 100), 1)

    start = (page - 1) * limit
    sliced = items[start:start + limit]

    return {
        "items": sliced,
        "page": page,
        "limit": limit,
        "total": len(items),
        "totalPages": (len(items) + limit - 1) // limit
    }


# =========================
# ROUTES
# =========================
@app.route("/")
def home():
    return jsonify({"status": "ok", "message": "Python bridge is running"})


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/search")
def search():
    data = external_search(request.args.get("q", ""))
    return jsonify(paginate(data,
        request.args.get("page", 1),
        request.args.get("limit", 20)
    ))


@app.route("/video/<video_id>")
def video(video_id):
    v = external_get_video(video_id)
    if not v:
        return jsonify({"error": "Not found"}), 404
    return jsonify(v)


@app.route("/categories")
def categories():
    return jsonify({"items": external_categories()})


@app.route("/tags")
def tags():
    return jsonify(paginate(
        external_tags(request.args.get("q", "")),
        request.args.get("page", 1),
        request.args.get("limit", 50)
    ))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001)
