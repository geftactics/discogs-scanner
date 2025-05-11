import os
import requests
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
import qrcode
from io import BytesIO

# CONFIGURE
DISCOGS_TOKEN = 'WQkuKPGBOMwsbyUMtOEyaWIjSLGzNijBZqpHNtCa'
USER_AGENT = 'VinylLabelGenerator/1.0'
USERNAME = 'geftactics'  # <-- Replace with your Discogs username

LABELS_PER_ROW = 3
LABELS_PER_COLUMN = 8
LABEL_WIDTH = A4[0] / LABELS_PER_ROW
LABEL_HEIGHT = A4[1] / LABELS_PER_COLUMN

# Function to wrap text if it's too wide
def wrap_text(text, font, max_width):
    lines = []
    words = text.split(' ')
    current_line = ""

    for word in words:
        # Check the width of the current line plus the next word
        if font.stringWidth(current_line + word, "Helvetica-Bold", 7) < max_width:
            current_line += word + " "
        else:
            # If the line exceeds the max width, push the current line to lines and start a new one
            lines.append(current_line.strip())
            current_line = word + " "

    if current_line:
        lines.append(current_line.strip())  # Add the last line if any

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
            'sort': 'artist'
        }

        response = requests.get(url, headers={'User-Agent': USER_AGENT}, params=params)
        data = response.json()

        releases.extend(data['releases'])

        if page >= data['pagination']['pages']:
            break

        page += 1

    print(f'Total releases fetched: {len(releases)}')
    return releases

def generate_pdf(releases, filename='labels.pdf'):
    c = canvas.Canvas(filename, pagesize=A4)

    for i, release in enumerate(releases):
        col = i % LABELS_PER_ROW
        row = (i // LABELS_PER_ROW) % LABELS_PER_COLUMN

        x = col * LABEL_WIDTH
        y = A4[1] - (row + 1) * LABEL_HEIGHT

        instance_id = release['instance_id']
        release_id = release['id']
        title = release['basic_information']['title']
        artist = ', '.join([a['name'] for a in release['basic_information']['artists']])
        catno = release['basic_information'].get('labels', [{}])[0].get('catno', '')

        # QR content and image
        qr_text = f'{release_id}.{instance_id}'
        qr = qrcode.make(qr_text)
        buffer = BytesIO()
        qr.save(buffer)
        buffer.seek(0)
        qr_img = ImageReader(buffer)

        # Position QR top-left
        qr_size = 25 * mm
        qr_x = x + 5
        qr_y = y + LABEL_HEIGHT - qr_size - 5
        c.drawImage(qr_img, qr_x, qr_y, width=qr_size, height=qr_size)

        # Align text with top of QR
        text_x = qr_x + qr_size + 0
        text_top_y = qr_y + qr_size - 15  # slight tweak for alignment

        # Wrap the title text if it's too wide for the label
        max_width = LABEL_WIDTH - qr_size - 10  # Maximum width for the title text
        wrapped_title = wrap_text(title, c, max_width)

        # Draw the wrapped title (bold)
        c.setFont("Helvetica-Bold", 7)
        for line_num, line in enumerate(wrapped_title):
            c.drawString(text_x, text_top_y - (line_num * 8), line)  # Adjust line height with 8

        # Draw the rest of the text (Artist, cat# + ID)
        c.setFont("Helvetica", 6)
        c.drawString(text_x, text_top_y - (len(wrapped_title) * 8) - 0, artist)
        c.drawString(text_x, text_top_y - (len(wrapped_title) * 8) - 17, f'{catno}')
        c.drawString(text_x, text_top_y - (len(wrapped_title) * 8) - 27, f'{release_id}.{instance_id}')
        c.drawString(text_x, text_top_y - (len(wrapped_title) * 8) - 37, f'Owner: Geoff@squiggle.org')

        # New page if needed
        if (i + 1) % (LABELS_PER_ROW * LABELS_PER_COLUMN) == 0:
            c.showPage()

    c.save()
    print(f'✅ PDF saved as {filename}')

if __name__ == '__main__':
    releases = fetch_collection()
    generate_pdf(releases)