import { useState, useEffect, useRef } from "react";
import { Send, Trash2, Bot, Loader2, Sparkles, X, MessageCircle } from "lucide-react";

export default function ChatInterface() {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [typingText, setTypingText] = useState("");
  const [typingIndex, setTypingIndex] = useState(0);
  const [currentResponse, setCurrentResponse] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [threadId, setThreadId] = useState(null); 
  const messagesEndRef = useRef(null);

  const formatMessageContent = (content) => {
    if (Array.isArray(content) && content.length > 0 && content[0]?.url && content[0]?.title) {
      return (
        <div className="flex flex-col gap-3 my-2">
          {content.map((item, idx) => (
            <div key={idx} className="p-2 rounded-md border border-gray-700 hover:bg-gray-800 transition-colors duration-200">
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline font-bold text-md">
                {item.title}
              </a>
              {item.snippet && <div className="text-gray-400 text-sm mt-1">{item.snippet}</div>}
            </div>
          ))}
        </div>
      );
    }
    if (content && typeof content === 'object' && content.weather && content.temperature) {
      return (
        <div className="flex flex-col gap-1">
          <div className="font-semibold">Weather: <span className="text-blue-300">{content.weather}</span></div>
          <div>Temperature: <span className="text-yellow-300">{content.temperature}</span></div>
          {content.humidity && <div>Humidity: <span className="text-green-300">{content.humidity}</span></div>}
          {content.wind && <div>Wind: <span className="text-purple-300">{content.wind}</span></div>}
          {content.location && <div>Location: <span className="text-gray-200">{content.location}</span></div>}
        </div>
      );
    }
    if (typeof content !== 'string') {
      return content; 
    }
 
    let formattedContent = content.replace(/\n/g, "<br />");
   
    formattedContent = formattedContent.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    const urlRegex = /(\b(https?|ftp|file):\/\/[\-A-Z0-9+&@#\/%?=~_|!:,.;]*[\-A-Z0-9+&@#\/%=~_|])|(\bwww\.[\-A-Z0-9+&@#\/%?=~_|!:,.;]*[\-A-Z0-9+&@#\/%=~_|])/ig;
    formattedContent = formattedContent.replace(urlRegex, (url) => {
      let fullUrl = url;
      if (!url.match(/^https?:\/\//i) && !url.match(/^ftp?:\/\//i) && !url.match(/^file?:\/\//i)) {
        fullUrl = `http://${url}`;
      }
      return `<a href="${fullUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:underline">${url}</a>`;
    });
    return <span dangerouslySetInnerHTML={{ __html: formattedContent }} />;
  };
  const chatContainerRef = useRef(null);
  
  const [userId, setUserId] = useState("");
  
  useEffect(() => {
    const storedUserId = localStorage.getItem('chatUserId');
    const newUserId = storedUserId || `user_${Math.random().toString(36).substring(2, 15)}`;
    
    if (!storedUserId) {
      localStorage.setItem('chatUserId', newUserId);
    }
    
    setUserId(newUserId);
    
  }, []);

  useEffect(() => {
    if (isTyping && typingIndex < typingText.length) {
      const timer = setTimeout(() => {
        setCurrentResponse(prev => prev + typingText[typingIndex]);
        setTypingIndex(typingIndex + 1);
      }, 15);
      
      return () => clearTimeout(timer);
    } else if (isTyping && typingIndex >= typingText.length) {
      setIsTyping(false);
      setMessages(prev => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1] = {
          ...newMessages[newMessages.length - 1],
          content: typingText,
          isTyping: false
        };
        return newMessages;
      });
    }
  }, [isTyping, typingIndex, typingText]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentResponse]);

  useEffect(() => {
    if (!isChatOpen && messages.length > 0 && messages[messages.length - 1].role === "assistant") {
      setUnreadCount(prev => prev + 1);
    }
  }, [messages, isChatOpen]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (chatContainerRef.current && !chatContainerRef.current.contains(event.target) && isChatOpen) {
        setIsChatOpen(false);
      }
    }
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isChatOpen]);

  useEffect(() => {
  }, [userId]);

  const clearHistory = async (userIdToClear) => {
    try {
      const id = userIdToClear || userId;
      await fetch('/api/clearChatHistory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id }),
      });
      setMessages([]);
      setUnreadCount(0);
    } catch (error) {
      console.error("Failed to clear history:", error);
    }
  };

  const handleSubmit = async () => {
    if (!inputText.trim()) return;
    
    const userMessage = { role: "user", content: inputText };
    setMessages(prev => [...prev, userMessage]);
    setInputText("");
    setIsLoading(true);
    setIsSearching(true);
    
    try {
      const response = await fetch('/api/chat/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText, userId, thread_id: threadId }), 
      });

      console.log('API Response Status:', response.status);
      console.log('API Response Status Text:', response.statusText);

      const responseCloneForText = response.clone();
      const responseText = await responseCloneForText.text();
      console.log('API Response Text Body:', responseText);
      
      let data;
      try {
        data = await response.json();
        console.log('API Response JSON Data:', data);
      } catch (e) {
        console.error('Failed to parse API response as JSON:', e);
        data = { error: 'Failed to parse response from server.' };
      }
      
      if (response.ok) {
        if (data.thread_id) {
          setThreadId(data.thread_id);
        }
        
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: "",
          isTyping: true
        }]);
        
        const aiResponseText = data.text || (typeof data === 'string' ? data : "Sorry, I couldn't get a response.");
        setTypingText(aiResponseText);
        setCurrentResponse("");
        setTypingIndex(0);
        setIsTyping(true);
      } else {
        console.error("Error from API. Status:", response.status, "Data:", data);
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: data?.error || "Sorry, I encountered an error. Please try again." 
        }]);
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: "Network error. Please check your connection and try again." 
      }]);
    } finally {
      setIsLoading(false);
      setIsSearching(false);
    }
  };

  const handleManualClear = () => {
    clearHistory();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const toggleChat = () => {
    setIsChatOpen(!isChatOpen);
    if (!isChatOpen) {
      setUnreadCount(0); 
    }
  };

  return (
    <div className="fixed bottom-0 right-0 z-50 flex items-end justify-end p-4">
    
      {!isChatOpen && (
        <button 
          onClick={toggleChat}
          className="flex items-center justify-center w-16 h-16 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-500 transition-all transform hover:scale-105 relative animate-bounce-subtle"
          aria-label="Open chat assistant"
        >
          <MessageCircle size={28} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
              {unreadCount}
            </span>
          )}
        </button>
      )}

    
      {isChatOpen && (
        <div 
          ref={chatContainerRef}
          className="flex flex-col w-96 h-120 max-h-120 bg-gray-900 text-gray-200 rounded-lg shadow-2xl animate-slideIn overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                <Bot className="text-white" size={18} />
              </div>
              <div>
                <h1 className="text-lg font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                  AI Assistant
                </h1>
                <p className="text-xs text-gray-400">Your Dost</p>
              </div>
              <Sparkles className="text-yellow-400" size={12} />
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={handleManualClear}
                className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                aria-label="Clear chat history"
              >
                <Trash2 size={16} />
              </button>
              <button 
                onClick={toggleChat}
                className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
                aria-label="Close chat"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 bg-gray-800 shadow-inner">
            {messages.length === 0 ? (
              <div className="text-center text-gray-400 mt-10 animate-fadeIn">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-blue-800 flex items-center justify-center">
                  <Bot size={24} className="text-blue-300" />
                </div>
                <p>How can I assist you today?</p>
                <p className="text-xs mt-2 text-gray-500">Ask me anything - I can search the web for up-to-date information!</p>
              </div>
            ) : (
              messages.map((msg, index) => (
                <div 
                  key={index} 
                  className={`mb-3 p-3 rounded-lg transition-all duration-300 ${
                    msg.role === "user" 
                    ? "bg-blue-900 ml-8 animate-slideInRight" 
                    : "bg-gray-700 mr-8 border-l-4 border-blue-500 animate-slideInLeft"
                  }`}
                >
                  <div className="text-xs text-gray-400 mb-1">
                    {msg.role === "user" ? "You" : "AI"}
                  </div>
                  <div className="text-sm">
                    {msg.role === "assistant" 
                      ? (msg.isTyping ? <span dangerouslySetInnerHTML={{ __html: currentResponse.replace(/\n/g, "<br />") }} /> : formatMessageContent(msg.content))
                      : msg.content
                    }
                    {msg.role === "assistant" && msg.isTyping && (
                      <span className="inline-block w-1.5 h-3 bg-blue-400 ml-1 animate-blink"></span>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
            {isLoading && (
              <div className="flex justify-center items-center h-8 text-blue-400 text-sm mb-2">
                {isSearching ? (
                  <>
                    <Bot />
                    <div>{" "}Thinking...</div>
                  </>
                ) : !isTyping ? (
                  <>
                    <Loader2 className="animate-spin mr-2" size={16} />
                    <div>Processing...</div>
                  </>
                ) : null}
              </div>
            )}
          </div>
          
          <div className="p-3 border-t border-gray-700 bg-gray-900">
            <div className="flex gap-2 relative">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                className="flex-1 p-2 text-sm border border-gray-600 rounded-full bg-gray-800 text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 pl-4"
                disabled={isLoading}
              />
              <button 
                onClick={handleSubmit} 
                className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 flex items-center justify-center transition-all transform hover:scale-105 w-10 h-10"
                disabled={isLoading || !inputText.trim()}
                aria-label="Send message"
              >
                {isLoading ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <Send size={16} />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideInRight {
          from { transform: translateX(10px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        
        @keyframes slideInLeft {
          from { transform: translateX(-10px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        
        @keyframes slideIn {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        
        @keyframes bounceSoft {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out;
        }
        
        .animate-slideInRight {
          animation: slideInRight 0.3s ease-out;
        }
        
        .animate-slideInLeft {
          animation: slideInLeft 0.3s ease-out;
        }
        
        .animate-slideIn {
          animation: slideIn 0.3s ease-out;
        }
        
        .animate-blink {
          animation: blink 0.8s infinite;
        }
        
        .animate-bounce-subtle {
          animation: bounceSoft 3s infinite ease-in-out;
        }
        
        .h-120 {
          height: 32rem;
        }
        
        .max-h-120 {
          max-height: 32rem;
        }
      `}</style>
    </div>
  );
}