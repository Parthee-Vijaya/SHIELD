"""
Qdrant vector database client configuration.

This module provides Qdrant client setup and utilities for vector
embeddings and semantic search of legal documents.
"""

import os
from typing import Optional

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams
from dotenv import load_dotenv
from loguru import logger

# Load environment variables
load_dotenv()

# Qdrant configuration
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY", None)  # Optional for local instances
QDRANT_TIMEOUT = int(os.getenv("QDRANT_TIMEOUT", "30"))

# Collection names
LEGAL_DOCUMENTS_COLLECTION = "legal_documents"
COMPLIANCE_KNOWLEDGE_COLLECTION = "compliance_knowledge"

# Vector dimensions (depends on embedding model)
# OpenAI text-embedding-3-small: 1536
# OpenAI text-embedding-ada-002: 1536
# sentence-transformers/all-MiniLM-L6-v2: 384
DEFAULT_VECTOR_SIZE = 1536

# Global client instance
_qdrant_client: Optional[QdrantClient] = None


def get_qdrant_client() -> QdrantClient:
    """
    Get or create Qdrant client instance (singleton pattern).

    Returns:
        QdrantClient: Configured Qdrant client

    Example:
        ```python
        from src.database import get_qdrant_client

        client = get_qdrant_client()
        collections = client.get_collections()
        print(f"Available collections: {collections}")
        ```
    """
    global _qdrant_client

    if _qdrant_client is None:
        logger.info(f"Connecting to Qdrant at {QDRANT_URL}")
        _qdrant_client = QdrantClient(
            url=QDRANT_URL,
            api_key=QDRANT_API_KEY,
            timeout=QDRANT_TIMEOUT,
        )
        logger.info("Qdrant client initialized successfully")

    return _qdrant_client


def init_qdrant(
    vector_size: int = DEFAULT_VECTOR_SIZE,
    distance: Distance = Distance.COSINE,
    recreate: bool = False
) -> None:
    """
    Initialize Qdrant collections for the compliance platform.

    Creates the necessary collections for storing legal document embeddings
    and compliance knowledge base.

    Args:
        vector_size: Dimension of embedding vectors (default: 1536 for OpenAI)
        distance: Distance metric (COSINE, EUCLID, DOT)
        recreate: If True, delete and recreate existing collections

    Example:
        ```python
        from src.database import init_qdrant

        # Initialize with default settings
        init_qdrant()

        # Initialize with custom vector size (e.g., for different embedding model)
        init_qdrant(vector_size=384)

        # Recreate collections (WARNING: deletes existing data)
        init_qdrant(recreate=True)
        ```
    """
    client = get_qdrant_client()

    collections = [
        {
            "name": LEGAL_DOCUMENTS_COLLECTION,
            "description": "Legal documents (laws, regulations, guidelines) with semantic search",
        },
        {
            "name": COMPLIANCE_KNOWLEDGE_COLLECTION,
            "description": "General compliance knowledge base and best practices",
        },
    ]

    for collection_info in collections:
        collection_name = collection_info["name"]

        try:
            # Check if collection exists
            existing_collections = client.get_collections().collections
            collection_exists = any(c.name == collection_name for c in existing_collections)

            if collection_exists:
                if recreate:
                    logger.warning(f"Deleting existing collection: {collection_name}")
                    client.delete_collection(collection_name)
                    collection_exists = False
                else:
                    logger.info(f"Collection already exists: {collection_name}")
                    continue

            # Create collection
            logger.info(f"Creating collection: {collection_name}")
            client.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(
                    size=vector_size,
                    distance=distance,
                ),
            )
            logger.info(f"Collection created successfully: {collection_name}")

        except Exception as e:
            logger.error(f"Failed to initialize collection {collection_name}: {e}")
            raise


def check_qdrant_connection() -> bool:
    """
    Check if Qdrant connection is working.

    Returns:
        bool: True if connection successful, False otherwise

    Example:
        ```python
        from src.database import check_qdrant_connection

        if check_qdrant_connection():
            print("Qdrant is ready")
        else:
            print("Qdrant connection failed")
        ```
    """
    try:
        client = get_qdrant_client()
        collections = client.get_collections()
        logger.info(f"Qdrant connection successful. Collections: {len(collections.collections)}")
        return True
    except Exception as e:
        logger.error(f"Qdrant connection failed: {e}")
        return False


def get_collection_info(collection_name: str) -> dict:
    """
    Get detailed information about a Qdrant collection.

    Args:
        collection_name: Name of the collection

    Returns:
        dict: Collection information including vector count, config, etc.

    Example:
        ```python
        from src.database import get_collection_info

        info = get_collection_info("legal_documents")
        print(f"Vector count: {info['vectors_count']}")
        ```
    """
    try:
        client = get_qdrant_client()
        collection = client.get_collection(collection_name)

        return {
            "name": collection_name,
            "vectors_count": collection.vectors_count,
            "points_count": collection.points_count,
            "status": collection.status,
            "config": collection.config,
        }
    except Exception as e:
        logger.error(f"Failed to get collection info for {collection_name}: {e}")
        raise


def delete_collection(collection_name: str) -> bool:
    """
    Delete a Qdrant collection.

    WARNING: This permanently deletes all vectors in the collection.

    Args:
        collection_name: Name of the collection to delete

    Returns:
        bool: True if deletion successful

    Example:
        ```python
        from src.database import delete_collection

        # Delete a collection (use with caution!)
        delete_collection("test_collection")
        ```
    """
    try:
        client = get_qdrant_client()
        client.delete_collection(collection_name)
        logger.warning(f"Collection deleted: {collection_name}")
        return True
    except Exception as e:
        logger.error(f"Failed to delete collection {collection_name}: {e}")
        return False


def reset_qdrant() -> None:
    """
    Reset all Qdrant collections (delete and recreate).

    WARNING: This deletes all vector data.

    Example:
        ```python
        from src.database import reset_qdrant

        # Reset all collections (use with caution!)
        reset_qdrant()
        ```
    """
    logger.warning("Resetting all Qdrant collections...")
    init_qdrant(recreate=True)
    logger.info("Qdrant reset complete")
