"""
Vector store integration with Qdrant for legal document search.

This module provides high-level operations for storing and searching
legal documents using semantic embeddings.
"""

import os
import uuid
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime

from qdrant_client.models import (
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue,
    SearchParams,
)
from openai import OpenAI
from loguru import logger

from .qdrant_service import (
    get_qdrant_client,
    LEGAL_DOCUMENTS_COLLECTION,
    COMPLIANCE_KNOWLEDGE_COLLECTION,
)
from src.core.models import LegalFramework


class VectorStore:
    """
    High-level interface for vector storage and semantic search.

    Handles embedding generation, document storage, and similarity search
    for legal documents and compliance knowledge.
    """

    def __init__(
        self,
        collection_name: str = LEGAL_DOCUMENTS_COLLECTION,
        embedding_model: str = "text-embedding-3-small",
    ):
        """
        Initialize vector store.

        Args:
            collection_name: Qdrant collection to use
            embedding_model: OpenAI embedding model name

        Example:
            ```python
            from src.database import VectorStore

            # For legal documents
            legal_store = VectorStore()

            # For general compliance knowledge
            knowledge_store = VectorStore(collection_name="compliance_knowledge")
            ```
        """
        self.client = get_qdrant_client()
        self.collection_name = collection_name
        self.embedding_model = embedding_model

        # Initialize OpenAI client
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            logger.warning("OPENAI_API_KEY not set. Embedding operations will fail.")
        self.openai_client = OpenAI(api_key=api_key) if api_key else None

    def generate_embedding(self, text: str) -> List[float]:
        """
        Generate embedding vector for text.

        Args:
            text: Input text to embed

        Returns:
            List of floats representing the embedding vector

        Raises:
            ValueError: If OpenAI client is not initialized

        Example:
            ```python
            store = VectorStore()
            embedding = store.generate_embedding("Article 5 of the EU AI Act...")
            print(f"Vector dimensions: {len(embedding)}")
            ```
        """
        if not self.openai_client:
            raise ValueError("OpenAI client not initialized. Set OPENAI_API_KEY environment variable.")

        try:
            response = self.openai_client.embeddings.create(
                model=self.embedding_model,
                input=text,
            )
            embedding = response.data[0].embedding
            logger.debug(f"Generated embedding with {len(embedding)} dimensions")
            return embedding

        except Exception as e:
            logger.error(f"Failed to generate embedding: {e}")
            raise

    def add_document(
        self,
        text: str,
        metadata: Dict[str, Any],
        document_id: Optional[str] = None,
    ) -> str:
        """
        Add a document to the vector store.

        Args:
            text: Document text content
            metadata: Document metadata (title, source, framework, etc.)
            document_id: Optional custom document ID (generated if not provided)

        Returns:
            str: Document ID (point ID in Qdrant)

        Example:
            ```python
            store = VectorStore()
            doc_id = store.add_document(
                text="Article 5: Prohibited AI practices...",
                metadata={
                    "title": "EU AI Act - Article 5",
                    "framework": "eu_ai_act",
                    "article": "5",
                    "source": "EUR-Lex",
                    "url": "https://...",
                    "publication_date": "2024-08-01"
                }
            )
            print(f"Document added with ID: {doc_id}")
            ```
        """
        try:
            # Generate document ID if not provided
            if document_id is None:
                document_id = str(uuid.uuid4())

            # Generate embedding
            embedding = self.generate_embedding(text)

            # Create point
            point = PointStruct(
                id=document_id,
                vector=embedding,
                payload={
                    "text": text,
                    "added_at": datetime.utcnow().isoformat(),
                    **metadata,
                },
            )

            # Upload to Qdrant
            self.client.upsert(
                collection_name=self.collection_name,
                points=[point],
            )

            logger.info(f"Added document {document_id} to {self.collection_name}")
            return document_id

        except Exception as e:
            logger.error(f"Failed to add document: {e}")
            raise

    def add_documents_batch(
        self,
        documents: List[Tuple[str, Dict[str, Any]]],
    ) -> List[str]:
        """
        Add multiple documents in batch for better performance.

        Args:
            documents: List of (text, metadata) tuples

        Returns:
            List of document IDs

        Example:
            ```python
            store = VectorStore()
            docs = [
                ("Article 5 text...", {"title": "Article 5", "framework": "eu_ai_act"}),
                ("Article 6 text...", {"title": "Article 6", "framework": "eu_ai_act"}),
            ]
            doc_ids = store.add_documents_batch(docs)
            print(f"Added {len(doc_ids)} documents")
            ```
        """
        try:
            points = []
            doc_ids = []

            for text, metadata in documents:
                doc_id = str(uuid.uuid4())
                embedding = self.generate_embedding(text)

                point = PointStruct(
                    id=doc_id,
                    vector=embedding,
                    payload={
                        "text": text,
                        "added_at": datetime.utcnow().isoformat(),
                        **metadata,
                    },
                )

                points.append(point)
                doc_ids.append(doc_id)

            # Batch upload
            self.client.upsert(
                collection_name=self.collection_name,
                points=points,
            )

            logger.info(f"Added {len(doc_ids)} documents in batch to {self.collection_name}")
            return doc_ids

        except Exception as e:
            logger.error(f"Failed to add documents batch: {e}")
            raise

    def search(
        self,
        query: str,
        limit: int = 5,
        score_threshold: Optional[float] = None,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Semantic search for relevant documents.

        Args:
            query: Search query text
            limit: Maximum number of results to return
            score_threshold: Minimum similarity score (0-1)
            filters: Optional metadata filters (e.g., {"framework": "eu_ai_act"})

        Returns:
            List of search results with scores and metadata

        Example:
            ```python
            store = VectorStore()

            # Simple search
            results = store.search("high-risk AI systems", limit=3)

            # Search with filters
            results = store.search(
                query="data protection requirements",
                limit=5,
                score_threshold=0.7,
                filters={"framework": "gdpr"}
            )

            for result in results:
                print(f"Score: {result['score']:.2f}")
                print(f"Title: {result['metadata']['title']}")
                print(f"Text: {result['text'][:200]}...")
            ```
        """
        try:
            # Generate query embedding
            query_embedding = self.generate_embedding(query)

            # Build filter conditions
            search_filter = None
            if filters:
                conditions = []
                for key, value in filters.items():
                    conditions.append(
                        FieldCondition(
                            key=key,
                            match=MatchValue(value=value),
                        )
                    )
                if conditions:
                    search_filter = Filter(must=conditions)

            # Perform search
            search_results = self.client.search(
                collection_name=self.collection_name,
                query_vector=query_embedding,
                limit=limit,
                score_threshold=score_threshold,
                query_filter=search_filter,
            )

            # Format results
            results = []
            for result in search_results:
                results.append({
                    "id": result.id,
                    "score": result.score,
                    "text": result.payload.get("text", ""),
                    "metadata": {k: v for k, v in result.payload.items() if k != "text"},
                })

            logger.info(f"Found {len(results)} results for query: '{query[:50]}...'")
            return results

        except Exception as e:
            logger.error(f"Search failed: {e}")
            raise

    def search_by_framework(
        self,
        query: str,
        framework: LegalFramework,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Search within a specific legal framework.

        Args:
            query: Search query
            framework: Legal framework to filter by
            limit: Maximum results

        Returns:
            List of search results

        Example:
            ```python
            store = VectorStore()

            # Search only EU AI Act documents
            results = store.search_by_framework(
                query="transparency obligations",
                framework=LegalFramework.EU_AI_ACT,
                limit=5
            )
            ```
        """
        return self.search(
            query=query,
            limit=limit,
            filters={"framework": framework.value},
        )

    def get_document(self, document_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve a document by ID.

        Args:
            document_id: Document ID

        Returns:
            Document data or None if not found

        Example:
            ```python
            store = VectorStore()
            doc = store.get_document("doc_123")
            if doc:
                print(doc["text"])
            ```
        """
        try:
            result = self.client.retrieve(
                collection_name=self.collection_name,
                ids=[document_id],
            )

            if result:
                point = result[0]
                return {
                    "id": point.id,
                    "text": point.payload.get("text", ""),
                    "metadata": {k: v for k, v in point.payload.items() if k != "text"},
                }
            return None

        except Exception as e:
            logger.error(f"Failed to retrieve document {document_id}: {e}")
            return None

    def delete_document(self, document_id: str) -> bool:
        """
        Delete a document from the vector store.

        Args:
            document_id: Document ID to delete

        Returns:
            bool: True if deleted successfully

        Example:
            ```python
            store = VectorStore()
            deleted = store.delete_document("doc_123")
            if deleted:
                print("Document deleted")
            ```
        """
        try:
            self.client.delete(
                collection_name=self.collection_name,
                points_selector=[document_id],
            )
            logger.info(f"Deleted document {document_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to delete document {document_id}: {e}")
            return False

    def count_documents(self, filters: Optional[Dict[str, Any]] = None) -> int:
        """
        Count documents in collection.

        Args:
            filters: Optional metadata filters

        Returns:
            int: Number of documents

        Example:
            ```python
            store = VectorStore()

            # Total documents
            total = store.count_documents()

            # EU AI Act documents only
            ai_act_count = store.count_documents(filters={"framework": "eu_ai_act"})
            ```
        """
        try:
            collection_info = self.client.get_collection(self.collection_name)
            return collection_info.points_count

        except Exception as e:
            logger.error(f"Failed to count documents: {e}")
            return 0

    def clear_collection(self) -> bool:
        """
        Delete all documents from collection.

        WARNING: This is irreversible.

        Returns:
            bool: True if successful

        Example:
            ```python
            store = VectorStore()
            # Clear all documents (use with caution!)
            store.clear_collection()
            ```
        """
        try:
            # Get all point IDs
            scroll_result = self.client.scroll(
                collection_name=self.collection_name,
                limit=10000,
            )
            point_ids = [point.id for point in scroll_result[0]]

            if point_ids:
                self.client.delete(
                    collection_name=self.collection_name,
                    points_selector=point_ids,
                )
                logger.warning(f"Cleared {len(point_ids)} documents from {self.collection_name}")

            return True

        except Exception as e:
            logger.error(f"Failed to clear collection: {e}")
            return False
