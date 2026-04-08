#!/usr/bin/env python3
"""Push all numbered articles from founders/ to Intercom dev workspace.
Resolves internal .md links to Intercom article URLs."""

import os, json, re, glob, time, hashlib
import markdown
import urllib.request

TOKEN = os.environ.get("INTERCOM_TOKEN")
if not TOKEN:
    raise SystemExit("INTERCOM_TOKEN is required (set your Intercom access token in the environment).")

API = "https://api.intercom.io"
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Intercom-Version": "2.11",
}

COLLECTION_MAP = {
    "1": "19287566",
    "2": "19287567",
    "3": "19287568",
    "4": "19287569",
    "5": "19287570",
    "6": "19287571",
    "7": "19287572",
    "8": "19287573",
    "9": "19287574",
    "10": "19287575",
}

def api_call(method, path, data=None):
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(f"{API}{path}", data=body, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        print(f"  ERROR {e.code}: {err[:200]}")
        return None

def build_link_map(manifest):
    """Build filename -> Intercom URL map by fetching each article's URL."""
    link_map = {}
    print("Building link map from manifest...")
    for filepath, info in manifest.items():
        aid = info["intercom_article_id"]
        result = api_call("GET", f"/articles/{aid}")
        if result and "url" in result:
            filename = os.path.basename(filepath)
            link_map[filename] = result["url"]
        time.sleep(0.1)
    print(f"  Mapped {len(link_map)} article URLs")
    return link_map

OLD_TO_NEW = {
    "upload-import-cap-table.md": "3.1-upload-import-cap-table.md",
    "issue-equity-grants-with-vesting.md": "5.1-set-up-an-equity-grant.md",
    "manage-equity-grants.md": "5.2-manage-equity-grants.md",
    "view-manage-investments.md": "6.6-view-manage-investments.md",
    "manage-investors.md": "6.1-view-manage-stakeholders.md",
    "state-fees-blue-sky.md": "7.3-state-fees-blue-sky.md",
    "filings-sec-form-d.md": "7.1-filings-sec-form-d.md",
    "jurisdictions.md": "7.5-jurisdictions.md",
    "risk-factors.md": "7.2-risk-factors.md",
    "team-management.md": "9.3-team-management.md",
}

def resolve_links(html, link_map):
    """Replace .md file links with Intercom article URLs in HTML."""
    def replace_link(match):
        raw = match.group(1)
        md_file = raw.split("#")[0]
        md_file = OLD_TO_NEW.get(md_file, md_file)
        if md_file in link_map:
            return f'href="{link_map[md_file]}"'
        return match.group(0)

    html = re.sub(r'href="([^"]+\.md(?:#[^"]*)?)"', replace_link, html)
    return html

def parse_article(filepath):
    with open(filepath, "r") as f:
        content = f.read()

    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            front_matter_text = parts[1]
            body = parts[2].strip()
        else:
            front_matter_text = ""
            body = content
    else:
        front_matter_text = ""
        body = content

    title = ""
    for line in front_matter_text.split("\n"):
        if line.strip().startswith("title:"):
            title = line.split(":", 1)[1].strip().strip('"').strip("'")
            break

    if not title:
        for line in body.split("\n"):
            if line.startswith("# "):
                title = line[2:].strip()
                break

    body = re.sub(r"^# .+\n?", "", body, count=1).strip()

    md_converter = markdown.Markdown(extensions=["tables", "fenced_code"])
    html = md_converter.convert(body)

    checksum = hashlib.md5(content.encode()).hexdigest()[:12]

    return title, html, checksum

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    founders_dir = os.path.join(script_dir, "founders")
    manifest_path = os.path.join(script_dir, "sync-manifest.json")
    files = sorted(glob.glob(os.path.join(founders_dir, "[0-9]*.md")))

    print(f"Found {len(files)} articles")

    manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}

    link_map = build_link_map(manifest) if manifest else {}

    updated = 0
    created = 0
    errors = 0

    for filepath in files:
        filename = os.path.basename(filepath)
        manifest_key = f"founders/{filename}"
        section_num = filename.split(".")[0]
        collection_id = COLLECTION_MAP.get(section_num, COLLECTION_MAP.get("1"))

        title, html, checksum = parse_article(filepath)

        if link_map:
            html = resolve_links(html, link_map)

        existing = manifest.get(manifest_key)

        if existing:
            aid = existing["intercom_article_id"]
            if existing.get("last_synced_checksum") == checksum and False:
                print(f"  Skip (unchanged): {filename}")
                continue
            print(f"  Updating: {filename} → article {aid}")
            result = api_call("PUT", f"/articles/{aid}", {
                "title": title,
                "body": html,
                "state": "published",
            })
            if result:
                manifest[manifest_key]["last_synced_checksum"] = checksum
                print(f"    ✓ Updated")
                updated += 1
            else:
                print(f"    ✗ FAILED")
                errors += 1
        else:
            print(f"  Creating: {filename} → '{title}'")
            result = api_call("POST", "/articles", {
                "title": title,
                "body": html,
                "author_id": 9537223,
                "state": "published",
                "parent_id": collection_id,
                "parent_type": "collection",
            })
            if result and "id" in result:
                manifest[manifest_key] = {
                    "intercom_article_id": str(result["id"]),
                    "last_synced_checksum": checksum,
                    "collection_id": collection_id,
                }
                print(f"    ✓ Created article {result['id']}")
                created += 1
            else:
                print(f"    ✗ FAILED")
                errors += 1

        time.sleep(0.2)

    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"\nDone: {updated} updated, {created} created, {errors} failed")

if __name__ == "__main__":
    main()
