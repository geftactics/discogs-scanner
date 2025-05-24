import argparse
import os
import re
import requests
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
import qrcode
from io import BytesIO

# === CONFIGURE ===
parser = argparse.ArgumentParser(description='Discogs app config')
parser.add_argument('--token', required=True, help='Discogs personal access token')
parser.add_argument('--username', required=True, help='Discogs username')
parser.add_argument('--ids', help='Comma-separated list of release_id.instance_id values (use 0 to skip label)')
args = parser.parse_args()
DISCOGS_TOKEN = args.token
USERNAME = args.username
ID_LIST = args.ids.split(',') if args.ids else None
USER_AGENT = 'DiscogsScanner-Generator/1.0'

LABELS_PER_ROW = 3
LABELS_PER_COLUMN = 7

# Margins (in mm)
MARGIN_TOP = 7 * mm
MARGIN_BOTTOM = 10 * mm
MARGIN_LEFT = 4 * mm
MARGIN_RIGHT = 10 * mm

# Spacing between labels (in mm)
H_SPACE = 6 * mm
V_SPACE = 1 * mm

# Calculated dimensions
USABLE_WIDTH = A4[0] - MARGIN_LEFT - MARGIN_RIGHT - (LABELS_PER_ROW - 1) * H_SPACE
USABLE_HEIGHT = A4[1] - MARGIN_TOP - MARGIN_BOTTOM - (LABELS_PER_COLUMN - 1) * V_SPACE

LABEL_WIDTH = USABLE_WIDTH / LABELS_PER_ROW
LABEL_HEIGHT = (USABLE_HEIGHT / LABELS_PER_COLUMN) - 2

print(LABEL_HEIGHT)

def wrap_text(text, font, max_width):
    lines = []
    words = text.split(' ')
    current_line = ""

    for word in words:
        if font.stringWidth(current_line + word, "Helvetica-Bold", 7) < max_width:
            current_line += word + " "
        else:
            lines.append(current_line.strip())
            current_line = word + " "

    if current_line:
        lines.append(current_line.strip())

    return lines

def fetch_collection():
    releases = []
    page = 1

    while True:
        print(f'Fetching page {page}...')
        url = f'https://api.discogs.com/users/{USERNAME}/collection/folders/0/releases'
        params = {
            'token': DISCOGS_TOKEN,
            'per_page': 100,
            'page': page,
            'sort': 'added'
        }

        response = requests.get(url, headers={'User-Agent': USER_AGENT}, params=params)
        data = response.json()

        releases.extend(data['releases'])

        if page >= data['pagination']['pages']:
            break

        page += 1

    print(f'Total releases fetched: {len(releases)}')
    return releases

def fetch_release_instance(release_id, instance_id):
    url = f'https://api.discogs.com/users/{USERNAME}/collection/folders/0/releases/{release_id}/instances/{instance_id}'
    params = {'token': DISCOGS_TOKEN}
    response = requests.get(url, headers={'User-Agent': USER_AGENT}, params=params)
    if response.status_code == 200:
        return response.json()
    else:
        print(f'⚠️ Failed to fetch {release_id}.{instance_id}')
        return None

def generate_pdf(releases, filename='labels.pdf'):
    c = canvas.Canvas(filename, pagesize=A4)

    for i, release in enumerate(releases):
        if release is None:
            continue

        col = i % LABELS_PER_ROW
        row = (i // LABELS_PER_ROW) % LABELS_PER_COLUMN

        x = MARGIN_LEFT + col * (LABEL_WIDTH + H_SPACE)
        y = A4[1] - MARGIN_TOP - (row + 1) * LABEL_HEIGHT - row * V_SPACE

        instance_id = release['instance_id']
        release_id = release['id']
        title = release['basic_information']['title']
        artist = ', '.join([re.sub(r'\s*\(\d+\)', '', a['name']) for a in release['basic_information']['artists']])
        label = ', '.join([l['name'] for l in release['basic_information'].get('labels', [])])
        catno = release['basic_information'].get('labels', [{}])[0].get('catno', '')

        qr_text = f'{release_id}.{instance_id}'
        qr = qrcode.make(qr_text)
        buffer = BytesIO()
        qr.save(buffer)
        buffer.seek(0)
        qr_img = ImageReader(buffer)

        qr_size = 25 * mm
        qr_x = x + 5
        qr_y = y + LABEL_HEIGHT - qr_size - 5
        c.drawImage(qr_img, qr_x, qr_y, width=qr_size, height=qr_size)

        text_x = qr_x + qr_size + 0
        text_top_y = qr_y + qr_size - 15

        max_width = LABEL_WIDTH - qr_size - 10
        wrapped_title = wrap_text(title, c, max_width)

        c.setFont("Helvetica-Bold", 7)
        for line_num, line in enumerate(wrapped_title):
            c.drawString(text_x, text_top_y - (line_num * 8), line)

        c.setFont("Helvetica", 6)
        c.drawString(text_x, text_top_y - (len(wrapped_title) * 8) - 0, artist)
        c.drawString(text_x, text_top_y - (len(wrapped_title) * 8) - 17, f'{label}')
        c.drawString(text_x, text_top_y - (len(wrapped_title) * 8) - 27, f'{catno}')
        c.drawString(text_x, text_top_y - (len(wrapped_title) * 8) - 37, f'{release_id}.{instance_id}')
        c.setFont("Helvetica", 7)
        c.drawString(text_x - 60, text_top_y - (len(wrapped_title) * 8) - 57, f'Owner: Geoff@squiggle org / 07990 511283')

        if (i + 1) % (LABELS_PER_ROW * LABELS_PER_COLUMN) == 0:
            c.showPage()

    c.save()
    print(f'✅ PDF saved as {filename}')

if __name__ == '__main__':
    if ID_LIST:
        releases = []
        for rid in ID_LIST:
            rid = rid.strip()
            if rid == "0":
                releases.append(None)
            else:
                if '.' not in rid:
                    print(f'⚠️ Invalid ID format: {rid}')
                    releases.append(None)
                    continue
                release_id, instance_id = rid.split('.')
                release = fetch_release_instance(release_id, instance_id)
                releases.append(release)
    else:
        releases = fetch_collection()

    generate_pdf(releases)
