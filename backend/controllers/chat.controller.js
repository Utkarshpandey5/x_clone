import { tool } from "@langchain/core/tools";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { StateGraph, MessagesAnnotation,MemorySaver } from "@langchain/langgraph";
import { v4 as uuid4 } from 'uuid';
import dotenv from 'dotenv'
import axios from 'axios';
import { z } from "zod";
import {
  SystemMessage,
  ToolMessage
} from '@langchain/core/messages';

dotenv.config()

const llm = new ChatGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
  model: "gemini-2.0-flash",
});


const google_api_key = process.env.GOOGLE_API_KEY; 
const google_search_url = "https://www.googleapis.com/customsearch/v1"; 
const cx_id = process.env.CX_ID;
const checkpointer = new MemorySaver();


const getWeather = tool(
  async ({ city }) => {
    try {
      const { data } = await axios.get(`https://wttr.in/${city}?format=%C+%t`);
      return data;
    } catch (error) {
      console.error(`Error fetching weather for ${city}:`, error);
      return `Failed to get weather for ${city}`;
    }
  },
  {
    name: "getWeather",
    description: "Take city as input and return the current weather.",
    schema: z.object({
      city: z.string().describe('City'),
    }),
  }
);
const webSearch = tool(
  async ({ query }) => {
    if (!google_api_key || !cx_id) {
      console.error("Google API key or CX ID is missing. Please check your .env file.");
      return "Search configuration error: API key or CX ID is missing.";
    }
    try {
      const params = {
        key: google_api_key,
        cx: cx_id, 
        q: query,
      };
      const { data } = await axios.get(google_search_url, { params });

      return JSON.stringify(data.items || data); 
    } catch (error) {
      console.error(`Error performing web search for "${query}":`, error.response ? error.response.data : error.message);
      return `Failed to perform web search for "${query}". Details: ${error.message}`;
    }
  },
  {
    name: "webSearch",
    description: `Take query as an input and return the relevant web search results to the user. Give proper relevent information explaination according to the user's query and useful information like Google search. show 
    result in markdown formatt and provide source link as well.`,
    schema: z.object({
      query: z.string().describe('User query for web search'),
    }),
  }
);

const multiply = tool(
  async ({ a, b }) => {
    return `${a * b}`;
  },
  {
    name: "multiply",
    description: "Takes 'a' and 'b' as numbers and returns their product.",
    schema: z.object({
      a: z.number().describe('First number'),
      b: z.number().describe('Second number'),
    }),
  }
);

const tools = [getWeather, multiply, webSearch];
const toolsByName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
const llmWithTools = llm.bindTools(tools);

async function llmCall(state) {
  const result = await llmWithTools.invoke([
    {
      role: "system",
      content:
        `You are a helpful assistant that performs arithmetic operations and fetches weather data for cities. and do a web search, You are genious like Google search.`,
    },
    ...state.messages,
  ]);
  return {
    messages: [result],
  };
}

async function toolNode(state) {
  const results = [];
  const lastMessage = state.messages.at(-1);

  if (lastMessage?.tool_calls?.length) {
    for (const toolCall of lastMessage.tool_calls) {
      const tool = toolsByName[toolCall.name];
      const observation = await tool.invoke(toolCall.args);
      results.push(
        new ToolMessage({
          content: observation,
          tool_call_id: toolCall.id,
        })
      );
    }
  }
  return { messages: results };
}

function shouldContinue(state) {
  const lastMessage = state.messages.at(-1);
  return lastMessage?.tool_calls?.length ? "Action" : "__end__";
}


const agentBuilder = new StateGraph(MessagesAnnotation)
  .addNode("llmCall", llmCall)
  .addNode("tools", toolNode)

  .addEdge("__start__", "llmCall")
  .addConditionalEdges("llmCall", shouldContinue, {
    Action: "tools",
    __end__: "__end__",
  })
  .addEdge("tools", "llmCall")
  .compile({checkpointer});



export const handleChatQuery = async (req, res) => {
  const { text, thread_id } = req.body;
  let memoryId = thread_id;
  if (!memoryId) {
    memoryId = uuid4();
  }
  const config = { configurable: { thread_id: memoryId } };

  if (!text) {
    return res.status(400).json({ error: "'text' is required" });
  }

  try {
    const result = await agentBuilder.invoke(
      { messages: [{ role: "user", content: text }] },
      config
    );

    const aiMessage = result.messages?.slice().reverse().find(
      (m) => (m.role === "assistant" || m.constructor.name === "AIMessage") && m.content
    );

    if (aiMessage && aiMessage.content) {
      res.json({ text: aiMessage.content, thread_id: memoryId }); 
    } else {
      console.warn(
        "Could not find AI response content in expected format. Result:",
        JSON.stringify(result, null, 2)
      );
      const lastMessage = result.messages?.at(-1);
      if (lastMessage && lastMessage.content) {
         res.json({ text: lastMessage.content, thread_id: memoryId });
      } else {
         res.json({ text: "Received response, but could not extract final content.", thread_id: memoryId });
      }
    }
  } catch (error) {
    console.error("❌ Error processing chat query:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
};
