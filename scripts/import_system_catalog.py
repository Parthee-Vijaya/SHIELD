"""Import a local KITOS-format snapshot; never copy the workbook into the repo.

Usage: python scripts/import_system_catalog.py /path/catalog.xlsx --dry-run
       python scripts/import_system_catalog.py /path/catalog.xlsx
The configured DATABASE_URL selects the target. Back up that database first.
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.services.system_catalog_import import import_catalog, read_catalog_workbook
from src.database.connection import Base, SessionLocal, engine
from src.database.system_catalog import CATALOG_TABLES


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    catalog = read_catalog_workbook(args.workbook)
    parties = {
        party["name"].casefold()
        for entry in catalog["entries"]
        for party in entry["parties"]
    }
    summary = {
        "source_name": catalog["source_name"],
        "source_sha256": catalog["source_sha256"],
        "system_count": len(catalog["entries"]),
        "supplier_count": len(parties),
        "dry_run": args.dry_run,
    }
    if not args.dry_run:
        Base.metadata.create_all(engine, tables=CATALOG_TABLES)
        with SessionLocal.begin() as db:
            snapshot, created = import_catalog(db, catalog)
            summary.update({"import_id": snapshot.id, "created": created})
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
