#!/bin/sh
set -e

# Installer systemafhængigheder
if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew mangler. Installer via https://brew.sh/ før scriptet køres." >&2
  exit 1
fi

brew install --quiet pdftotext || true

# Installer Python requirements
python3 -m venv venv
. venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
