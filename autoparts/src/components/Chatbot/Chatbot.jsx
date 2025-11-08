import React, { useState, useEffect, useRef } from "react";
import "./Chatbot.css";

const Chatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (isOpen && !sessionId) {
      const newSessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      setSessionId(newSessionId);
    }
  }, [isOpen, sessionId]);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setTimeout(() => {
        setMessages([
          {
            text: "👋 Hi there! I'm your <b>AutoSmart Parts Assistant</b>. How can I help you today?",
            sender: "bot",
          },
        ]);
      }, 300);
    }
  }, [isOpen]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = { text: input, sender: "user" };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    const botIndex = messages.length + 1;
    setMessages((prev) => [
      ...prev,
      { text: "", sender: "bot", streaming: true },
    ]);
    setIsTyping(true);

    try {
      const token = typeof window !== 'undefined' ? window.localStorage.getItem('token') : null;

      // If the user asks about orders/shipping, fetch a concise order summary and include it
      const orderQueryRe = /\b(order|orders|shipment|shipping|arrival|arriving|deliver|delivery|tracking|eta)\b/i;
      const body = { message: input, sessionId };
      if (orderQueryRe.test(input) && token) {
        try {
          const resp = await fetch('http://localhost:3001/api/orders/my', { headers: { Authorization: token ? `Bearer ${token}` : '' } });
          if (resp.ok) {
            const data = await resp.json();
            if (data && data.success && Array.isArray(data.orders)) {
              const summarizeOrder = (o) => {
                const placed = o.created_at ? new Date(o.created_at).toLocaleDateString() : 'unknown';
                const items = (o.items || []).map(i => `${i.product_name || i.name || 'item'} x${i.quantity || 0}`).join(', ');
                return `Order ${o.order_number || o.id} (status: ${o.status || 'unknown'}, placed: ${placed}, total: $${Number(o.total_amount || 0).toFixed(2)}): ${items}`;
              };
              body.orderSummary = (data.orders || []).slice(0, 10).map(summarizeOrder).join('\n');
            }
          }
        } catch (err) {
          console.warn('Chatbot: failed to fetch orders for summary', err);
        }
      }

      const response = await fetch("http://localhost:3001/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : '' },
        body: JSON.stringify(body),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let partialText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        partialText += decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((msg, i) =>
            i === botIndex ? { ...msg, text: partialText } : msg
          )
        );
      }

      setMessages((prev) =>
        prev.map((msg, i) =>
          i === botIndex ? { ...msg, streaming: false } : msg
        )
      );
      setIsTyping(false);
    } catch {
      setIsTyping(false);
      setMessages((prev) => [
        ...prev.filter((m) => !m.streaming),
        { text: "⚠️ Error: Could not reach AI server.", sender: "bot" },
      ]);
    }
  };

  const trackUserAction = async (action, productId = null) => {
    if (!sessionId) return;

    try {
      await fetch("http://localhost:3001/analytics/track-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          userQuery: messages.find(m => m.sender === 'user')?.text || 'unknown',
          action,
          productId
        }),
      });
    } catch (error) {
      console.error("Failed to track user action:", error);
    }
  };

  useEffect(() => {
    const handleAddToCartClick = (event) => {
      if (event.target.classList.contains("add-to-cart-btn")) {
        const productId = event.target.getAttribute("data-id");
        window.dispatchEvent(
          new CustomEvent("add-to-cart", { detail: productId })
        );

        trackUserAction('purchased', productId);

        alert(`✅ Product added to cart!`);
      }

      if (event.target.classList.contains("decline-btn")) {
        const productId = event.target.getAttribute("data-id");
        trackUserAction('declined', productId);

        // Update the message to show the user declined
        setMessages((prev) => [
          ...prev,
          { text: "I declined that recommendation. Can you suggest something else?", sender: "user" }
        ]);
      }
    };

    document.addEventListener("click", handleAddToCartClick);
    return () => document.removeEventListener("click", handleAddToCartClick);
  }, [sessionId, messages]);

  const handleKeyPress = (e) => {
    if (e.key === "Enter") handleSend();
  };

  return (
    <>
      <div className="chatbot-icon" onClick={() => setIsOpen(!isOpen)}>
        <span className="chat-label">AI Assistant</span> 💬
      </div>

      {isOpen && (
        <div className="chatbot-container">
          <div className="chat-messages">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`chat-message ${msg.sender}`}
                dangerouslySetInnerHTML={{ __html: msg.text }}
              ></div>
            ))}

            {isTyping && (
              <div className="typing-indicator">
                🚗 AutoSmart is typing
                <span className="dots">
                  <span>.</span><span>.</span><span>.</span>
                </span>
              </div>
            )}
            <div ref={chatEndRef}></div>
          </div>

          <div className="chat-input">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask me about car parts..."
            />
            <button onClick={handleSend}>Send</button>
          </div>
        </div>
      )}
    </>
  );
};

export default Chatbot;