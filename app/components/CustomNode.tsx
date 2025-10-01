'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Handle, Position, NodeProps } from 'react-flow-renderer';
import { Trash2, Plus, Tag } from 'lucide-react';

// --- TYPE DEFINITIONS ---
type ChecklistItemType = {
  id: string;
  text: string;
  completed: boolean;
};

type NodeData = {
  label: string;
  color?: string;
  type?: 'default' | 'checklist';
  title?: string;
  items?: ChecklistItemType[];
  width?: number;
  height?: number;
  tags?: string[];
  onDelete: (id: string) => void;
  onLabelChange: (id: string, newText: string) => void;
  onResize: (id: string, newSize: { width: number; height: number }) => void;
  onItemUpdate?: (nodeId: string, itemId: string, newText: string) => void;
  onItemToggle?: (nodeId: string, itemId: string) => void;
  onAddItem?: (nodeId: string, newItemText: string) => void;
  onItemDelete?: (nodeId: string, itemId: string) => void;
  onToggleTag?: (nodeId: string, tag: string) => void;
  availableTags?: string[];
};

// --- SUB-COMPONENTS ---

function ChecklistItem({ item, nodeId, data }: { item: ChecklistItemType, nodeId: string, data: NodeData }) {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(item.text);

  useEffect(() => { setText(item.text); }, [item.text]);

  const handleUpdate = () => {
    setIsEditing(false);
    if (data.onItemUpdate && text.trim() !== item.text) {
      data.onItemUpdate(nodeId, item.id, text.trim());
    }
  };

  return (
    <div className="flex items-center gap-2 group">
      <input type="checkbox" checked={item.completed} onChange={() => data.onItemToggle?.(nodeId, item.id)} className="form-checkbox h-4 w-4 bg-gray-600 border-gray-500 text-indigo-500 rounded focus:ring-indigo-500/50 flex-shrink-0"/>
      {isEditing ? (
        <input type="text" value={text} onChange={(e) => setText(e.target.value)} onBlur={handleUpdate} onKeyDown={(e) => e.key === 'Enter' && handleUpdate()} className="bg-gray-700 text-sm text-gray-300 w-full outline-none rounded px-1" autoFocus />
      ) : (
        <span onDoubleClick={() => setIsEditing(true)} className={`flex-grow text-sm cursor-pointer break-words min-w-0 ${item.completed ? 'line-through text-gray-500' : 'text-gray-300'}`}>
          {item.text}
        </span>
      )}
      <button onClick={() => data.onItemDelete?.(nodeId, item.id)} className="text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14} /></button>
    </div>
  );
}

function DefaultNodeContent({ data, id }: { data: NodeData, id: string }) {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(data.label);

  useEffect(() => { setText(data.label); }, [data.label]);

  const handleUpdate = () => {
    setIsEditing(false);
    data.onLabelChange(id, text);
  };

  return (
    <div className="drag-handle w-full h-full flex items-center justify-center p-3 cursor-move" onDoubleClick={() => setIsEditing(true)}>
      {isEditing ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={handleUpdate}
          onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) handleUpdate() } }
          className="nodrag bg-gray-600 text-white text-center w-full h-full outline-none rounded cursor-text resize-none"
          autoFocus
        />
      ) : (
        <div className="text-white text-center px-2 break-words">{data.label}</div>
      )}
    </div>
  );
}

function ChecklistNodeContent({ data, id }: { data: NodeData, id: string }) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newItemText, setNewItemText] = useState('');
  const [title, setTitle] = useState(data.title || '');

  useEffect(() => { setTitle(data.title || ''); }, [data.title]);

  const handleTitleUpdate = () => {
    setIsEditingTitle(false);
    data.onLabelChange(id, title);
  };
  
  const handleAddNewItem = () => {
    if (newItemText.trim() && data.onAddItem) {
        data.onAddItem(id, newItemText.trim());
        setNewItemText('');
        setIsAdding(false);
    } else {
        setIsAdding(false);
    }
  };

  return (
    <>
      <div className="drag-handle p-3 bg-black/20 rounded-t-md cursor-move" onDoubleClick={() => setIsEditingTitle(true)}>
        {isEditingTitle ? (
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={handleTitleUpdate} onKeyDown={(e) => e.key === 'Enter' && handleTitleUpdate()} className="nodrag bg-gray-600 text-white text-center w-full outline-none rounded font-semibold cursor-text"/>
        ) : (
          <div className="text-white text-center font-semibold px-2 break-words">{data.title}</div>
        )}
      </div>
      <div className="p-3 space-y-2 flex-1 overflow-y-auto">
        {data.items?.map(item => <ChecklistItem key={item.id} item={item} nodeId={id} data={data} />)}
        {isAdding ? (
           <div className="flex items-center gap-2">
              <input type="checkbox" disabled className="form-checkbox h-4 w-4 bg-gray-700 border-gray-600"/>
              <input type="text" value={newItemText} onChange={(e) => setNewItemText(e.target.value)} onBlur={handleAddNewItem} onKeyDown={(e) => e.key === 'Enter' && handleAddNewItem()} placeholder="Add new item..." className="bg-gray-700 text-sm text-gray-300 w-full outline-none rounded px-1" autoFocus/>
          </div>
        ) : (
          <button onClick={() => setIsAdding(true)} className="text-xs text-blue-400 hover:text-blue-300 w-full text-left mt-2 flex items-center gap-1">
            <Plus size={14} /> Add item
          </button>
        )}
      </div>
    </>
  );
}


// --- MAIN CUSTOM NODE COMPONENT ---
export default function CustomNode({ id, data, selected }: NodeProps<NodeData>) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [showTagMenu, setShowTagMenu] = useState(false);

  const nodeColor = data.color || (data.type === 'checklist' ? '#4338ca' : '#374151');
  const selectedBorderColor = 'border-blue-500';
  const width = data.width || (data.type === 'checklist' ? 250 : 150);
  const height = data.height || (data.type === 'checklist' ? 100 : 50);

  const onResizeStart = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = nodeRef.current?.offsetWidth || width;
    const startHeight = nodeRef.current?.offsetHeight || height;

    const doResize = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(150, startWidth + moveEvent.clientX - startX);
      const newHeight = Math.max(data.type === 'checklist' ? 120 : 50, startHeight + moveEvent.clientY - startY);
      if (nodeRef.current) {
        nodeRef.current.style.width = `${newWidth}px`;
        nodeRef.current.style.height = `${newHeight}px`;
      }
    };

    const stopResize = () => {
      window.removeEventListener('mousemove', doResize);
      window.removeEventListener('mouseup', stopResize);
      if (nodeRef.current) {
        data.onResize(id, {
          width: nodeRef.current.offsetWidth,
          height: nodeRef.current.offsetHeight
        });
      }
    };

    window.addEventListener('mousemove', doResize);
    window.addEventListener('mouseup', stopResize);
  };

  return (
    <div ref={nodeRef} style={{ width: `${width}px`, height: `${height}px` }} className="relative group/node">
      <div 
        className={`w-full h-full border-2 rounded-lg shadow-md ${selected ? selectedBorderColor : 'border-transparent'} flex flex-col overflow-hidden transition-colors`}
        style={{ backgroundColor: nodeColor }}
      >
        {data.type === 'checklist' ? <ChecklistNodeContent data={data} id={id} /> : <DefaultNodeContent data={data} id={id} />}
      </div>

      <Handle type="target" position={Position.Top} className="!bg-gray-500 !w-3 !h-3 z-10" />
      <Handle type="source" position={Position.Bottom} className="!bg-gray-500 !w-3 !h-3 z-10" />
      
      {/* Node Actions (Delete, Tag) */}
      <div className={`absolute -top-3 -right-3 flex gap-1 z-20 transition-opacity opacity-0 ${selected ? '!opacity-100' : 'group-hover/node:opacity-100'}`}>
          <button onClick={() => setShowTagMenu(!showTagMenu)} className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-1.5" title="Manage tags"><Tag size={12} /></button>
          <button onClick={() => data.onDelete(id)} className="bg-red-600 hover:bg-red-700 text-white rounded-full p-1.5"><Trash2 size={12} /></button>
      </div>
      
      {/* Tag Menu Popup */}
      {showTagMenu && (
        <div className="absolute top-8 left-0 bg-gray-800 rounded-lg shadow-xl p-2 min-w-[150px] z-30 nodrag">
          <div className="max-h-48 overflow-y-auto space-y-1">
            {(data.availableTags || []).map(tag => (
              <button
                key={tag}
                onClick={() => data.onToggleTag?.(id, tag) }
                className={`w-full text-left px-3 py-1.5 rounded text-sm transition ${(data.tags || []).includes(tag) ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Display Assigned Tags */}
      {(data.tags || []).length > 0 && (
        <div className="absolute -bottom-7 left-0 right-0 flex flex-wrap gap-1 justify-center px-2 nodrag">
          {(data.tags || []).map(tag => (
            <span key={tag} className="px-2 py-0.5 bg-gray-600/90 text-white text-xs rounded-full">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Resize Handle */}
      <div
        onMouseDown={onResizeStart}
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize rounded-br-lg z-20 nodrag opacity-0 group-hover/node:opacity-100"
      >
        <div className="w-full h-full bg-gray-500/50 hover:bg-gray-400 rounded-br-lg" />
      </div>
    </div>
  );
}