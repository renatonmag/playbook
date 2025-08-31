from multiprocessing import context
from llama_index.core import (
    SimpleDirectoryReader,
    VectorStoreIndex,
    Settings,
    Document,
)
from llama_index.embeddings.google_genai import GoogleGenAIEmbedding
from llama_index.llms.google_genai import GoogleGenAI
from llama_index.core.prompts import RichPromptTemplate
from dotenv import load_dotenv
import os

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

Settings.api_key = GOOGLE_API_KEY
Settings.embed_model = GoogleGenAIEmbedding(model_name="gemini-embedding-001")
Settings.llm = GoogleGenAI(model="gemini-2.5-flash", temperature=0.0)

# Define the custom system prompt
custom_prompt = """
Sua tarefa é responder a perguntas sobre as estratégias de trading com base no contexto fornecido.
Para cada resposta, forneça a galeria de fotos (galeryId) relevante no formato JSON.
Não inclua markdown.
Se a galeria não for mencionada no contexto, responda apenas com a informação textual.
Formato de saída:
[{
  "textBlock": "Sua resposta textual aqui.",
  "galeryId": <o ID da galeria relevante ou null>
},{
  "textBlock": "Sua resposta textual aqui.",
  "galeryId": <o ID da galeria relevante ou null>
},{
  "textBlock": "Sua resposta textual aqui.",
  "galeryId": <o ID da galeria relevante ou null>
},]

Context information is below.
---------------------
{{context_str}}
---------------------
Given the context information and not prior knowledge, answer the query.
Query: {{query_str}}
Answer: 
"""

strategy_text = """
# Opening Range Breakout PlayBook

**Regras da estratégia**

**Entrada:**

1. Depois que fechar fora do range
2. O range começa quando a maxima da barra anterior for maior que a barra atual. Como na barra 1. Ela marca o inicio do range. A barra 3 forma o segundo ponto do range, o de venda.
3. Veja que a barra 2 não fechou fora do range portanto não é uma entrada
4. A barra 4 fechou fora, então é uma entrada.

**Variaçoes:**

Se a primeria barra for bem grande e forte. Como a barra 1

**Saida:**

Stop AMA12

A barra 1 foi a segunda barra fechando dentro da média. Quando a segunda barra fechar dentro da média, Você coloca o stop nesta segunda barra.

Se for o terceiro fechamento dentro

No caso da imagem onde o preço entra na media duas vezes muito próximas, mantenha o stop no ponto 1

No caso das imagens acima nós seriamos estopados na região da barra 1, mas poderiamos entrar novamente na barra 3. Lembrando que a operação começou muito antes, então a contagem de barras dentro da média ja estaria adiantada.

Outros exemplos:

Exemplos:

Entrada no fechamento da barra 1. Na barra 2 esta operação ainda não está no ponto de encurtar o stop.

Eu encurtei o stop prematuramente para o ponto do triangulo verde. Fui stopado sem necessidade.

Somente apos o fechamento da barra 3 seria bom encurtar o stop.

O rompimento pode começar na primeira barra. Se ela for grande 350~400+ pontos

Esse foi um stop correto. Na barra 2

"""


data = {
    "name": "Opening Range Breakout",
    "description": "Trade de rompimento de range de abertura",
    "content": [
        [
            {"text": "1. Depois que fechar fora do range", "galeryId": 1},
            {
                "text": "2. O range começa quando a maxima da barra anterior for maior que a barra atual. Como na barra 1. Ela marca o inicio do range. A barra 3 forma o segundo ponto do range, o de venda.",
                "galeryId": 2,
            },
            {
                "text": "3. Veja que a barra 2 não fechou fora do range portanto não é uma entrada",
                "galeryId": None,
            },
            {
                "text": "4. A barra 4 fechou fora, então é uma entrada.",
                "galeryId": None,
            },
        ]
    ],
}

# strategy_text = " ".join(
#     f'{item["text"]} {{"galeryId":{item["galeryId"] if item["galeryId"] is not None else "null"}}}'
#     for sublist in data["content"] for item in sublist
# )

# Create a Document object
strategy_document = Document(
    text=strategy_text,
    metadata={"name": data["name"], "description": data["description"]},
)

# Create a VectorStoreIndex from the documents
index = VectorStoreIndex.from_documents([strategy_document])

# Use the custom system prompt when creating the query engine
qa_prompt_tmpl = RichPromptTemplate(custom_prompt)
query_engine = index.as_query_engine(text_qa_template=qa_prompt_tmpl)
response = query_engine.query(
    "Me fale sobre possiveis problemas que posso encontrar no trade"
)
print(response)
