from fastapi import APIRouter
from pydantic import BaseModel, Field

import asyncio
from llama_index_server.index_server import query_index
from utils.config import API_TIMEOUT
import logging

logger = logging.getLogger(__name__)

qa_router = APIRouter(
    prefix="/qa",
    tags=["question answering"],
)


class QuestionAnsweringRequest(BaseModel):
    question: str = Field(..., description="question to be answered")


class QuestionAnsweringResponse(BaseModel):
    data: str = Field(..., description="answer to the question")


@qa_router.post(
    "/query",
    response_model=QuestionAnsweringResponse,
    description="ask questions related to documents, return a standard answer if there is a good match in the knowledge base",
)
async def answer_question(req: QuestionAnsweringRequest):
    logger.info("answer question from user")
    query_text = req.question
    answer = await asyncio.wait_for(
        query_index(query_text), timeout=API_TIMEOUT
    )
    return QuestionAnsweringResponse(data=answer)
