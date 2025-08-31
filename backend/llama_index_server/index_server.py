import asyncio
from concurrent.futures import ThreadPoolExecutor
from enum import Enum
import logging
from typing import Tuple
from llama_index.core.indices.base import BaseIndex
from llama_index.embeddings.google_genai import GoogleGenAIEmbedding
from llama_index.llms.google_genai import GoogleGenAI
from llama_index.core import (
    VectorStoreIndex,
    Settings,
    load_index_from_storage,
    StorageContext,
)
import os
from utils import data_util

logger = logging.getLogger(__name__)

executor = ThreadPoolExecutor(max_workers=100)

CURRENT_DIR = os.path.dirname(__file__)
PARENT_DIR = os.path.dirname(CURRENT_DIR)
LLAMA_INDEX_HOME = os.path.join(PARENT_DIR, "llama_index_server")
os.environ["LLAMA_INDEX_CACHE_DIR"] = f"{LLAMA_INDEX_HOME}/llama_index_cache"
INDEX_PATH = f"{LLAMA_INDEX_HOME}/saved_index"


class Source(str, Enum):
    GEMINI_2_5_FLASH = "gemini-2.5-flash"


async def query_index(query_text, only_for_meta=False):
    logger.info("querying index")

    return "test"


class IndexStorage:
    def __init__(self):
        self._current_model = Source.GEMINI_2_5_FLASH
        logger.info("initializing index and mongo ...")
        self._index = self.initialize_index()

    def initialize_index(self) -> BaseIndex:
        Settings.embed_model = GoogleGenAIEmbedding(
            model_name="gemini-embedding-001"
        )
        if os.path.exists(INDEX_PATH) and os.path.exists(
            INDEX_PATH + "/docstore.json"
        ):
            logger.info(f"Loading index from dir: {INDEX_PATH}")
            index = load_index_from_storage(
                StorageContext.from_defaults(persist_dir=INDEX_PATH),
            )
        else:
            data_util.assert_true(
                os.path.exists(CSV_PATH), f"csv file not found: {CSV_PATH}"
            )
            standard_answers = csv_util.load_standard_answers_from_csv(
                CSV_PATH
            )
            documents = [
                answer.to_llama_index_document()
                for answer in standard_answers
            ]
            index = VectorStoreIndex.from_documents(documents)
            index.storage_context.persist(persist_dir=INDEX_PATH)

        return index
