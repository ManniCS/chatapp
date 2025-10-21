"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import styles from "./page.module.css";

interface Message {
  role: "user" | "assistant";
  content: string;
  analyticsId?: string;
  feedback?: number; // 1 = thumbs up, -1 = thumbs down
}

export default function ChatPage() {
  const params = useParams();
  const companyId = params.companyId as string;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const submitFeedback = async (analyticsId: string, feedback: number) => {
    try {
      const response = await fetch("/api/chat/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analyticsId, feedback }),
      });

      if (response.ok) {
        // Update the message with the feedback
        setMessages((prev) =>
          prev.map((msg) =>
            msg.analyticsId === analyticsId ? { ...msg, feedback } : msg,
          ),
        );
      }
    } catch (error) {
      console.error("Error submitting feedback:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          sessionId,
          companyId,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.response,
            analyticsId: data.analyticsId,
          },
        ]);
        setSessionId(data.sessionId);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Sorry, I encountered an error. Please try again.",
          },
        ]);
      }
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <h1 className={styles.headerTitle}>Customer Chat</h1>
          <p className={styles.headerSubtitle}>
            Ask questions about our documents and services
          </p>
        </div>
      </header>

      <div className={styles.messagesContainer}>
        <div className={styles.messagesContent}>
          {messages.length === 0 ? (
            <div className={styles.welcomeContainer}>
              <div className={styles.welcomeCard}>
                <h2 className={styles.welcomeTitle}>Welcome to Chat!</h2>
                <p className={styles.welcomeText}>
                  Ask me anything about our documents and I'll help you find the
                  information you need.
                </p>
                <div className={styles.exampleList}>
                  <p>Example questions:</p>
                  <ul>
                    <li>What are your business hours?</li>
                    <li>What services do you offer?</li>
                    <li>How can I contact support?</li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.messageList}>
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`${styles.messageWrapper} ${
                    message.role === "user"
                      ? styles.messageWrapperUser
                      : styles.messageWrapperAssistant
                  }`}
                >
                  <div
                    className={`${styles.messageBubble} ${
                      message.role === "user"
                        ? styles.messageBubbleUser
                        : styles.messageBubbleAssistant
                    }`}
                  >
                    <p className={styles.messageText}>{message.content}</p>
                    {message.role === "assistant" && message.analyticsId && (
                      <div className={styles.feedbackButtons}>
                        <button
                          onClick={() =>
                            submitFeedback(message.analyticsId!, 1)
                          }
                          className={`${styles.feedbackButton} ${
                            message.feedback === 1 ? styles.feedbackActive : ""
                          }`}
                          disabled={message.feedback !== undefined}
                          title="Helpful"
                        >
                          👍
                        </button>
                        <button
                          onClick={() =>
                            submitFeedback(message.analyticsId!, -1)
                          }
                          className={`${styles.feedbackButton} ${
                            message.feedback === -1 ? styles.feedbackActive : ""
                          }`}
                          disabled={message.feedback !== undefined}
                          title="Not helpful"
                        >
                          👎
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div
                  className={`${styles.messageWrapper} ${styles.messageWrapperAssistant}`}
                >
                  <div
                    className={`${styles.messageBubble} ${styles.messageBubbleAssistant}`}
                  >
                    <div className={styles.loadingBubble}>
                      <div className={styles.loadingDot}></div>
                      <div className={styles.loadingDot}></div>
                      <div className={styles.loadingDot}></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      <div className={styles.inputContainer}>
        <div className={styles.inputContent}>
          <form onSubmit={handleSubmit} className={styles.inputForm}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              disabled={loading}
              className={styles.input}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className={styles.sendButton}
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
