import React from 'react';
import { ChatMessage } from '../types';

interface ChatBubbleProps {
  message: ChatMessage;
}

const ChatBubble: React.FC<ChatBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';
  
  // Simple markdown renderer for bold text
  const formatText = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  return (
    <div className={`flex w-full mb-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div 
        className={`relative max-w-[85%] sm:max-w-[70%] px-4 py-2 rounded-lg shadow-sm text-sm sm:text-base ${
          isUser 
            ? 'bg-[#E7FFDB] text-gray-800 rounded-tr-none' 
            : 'bg-white text-gray-800 rounded-tl-none'
        }`}
      >
        <div className="whitespace-pre-wrap break-words leading-relaxed">
            {formatText(message.text)}
        </div>
        <div className="text-[10px] text-gray-400 text-right mt-1 select-none">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {isUser && <span className="ml-1 text-blue-400">✓✓</span>}
        </div>
        
        {/* Tail decoration */}
        <div className={`absolute top-0 w-0 h-0 border-[6px] border-transparent ${
          isUser 
            ? 'right-[-6px] border-t-[#E7FFDB] border-l-[#E7FFDB]' 
            : 'left-[-6px] border-t-white border-r-white'
        }`}></div>
      </div>
    </div>
  );
};

export default ChatBubble;