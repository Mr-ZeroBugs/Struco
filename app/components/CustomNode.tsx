'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Handle, Position, NodeProps } from 'react-flow-renderer';
import { Trash2, Plus } from 'lucide-react';

// Types (ไม่มีการเปลี่ยนแปลง)
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
  onDelete: (id: string) => void;
  onLabelChange: (id: string, newText: string) => void;
  onResize: (id: string, newSize: { width: number; height: number }) => void;
  onItemUpdate?: (nodeId: string, itemId: string, newText: string) => void;
  onItemToggle?: (nodeId: string, itemId: string) => void;
  onAddItem?: (nodeId: string, newItemText: string) => void;
  onItemDelete?: (nodeId: string, itemId: string) => void;
};

// Sub-component for individual checklist items
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

// Sub-component for Default Node content
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
        <input type="text" value={text} onChange={(e) => setText(e.target.value)} onBlur={handleUpdate} onKeyDown={(e) => e.key === 'Enter' && handleUpdate()} className="nodrag bg-gray-600 text-white text-center w-full outline-none rounded cursor-text"/>
      ) : (
        <div className="text-white text-center px-2 break-words">{data.label}</div>
      )}
    </div>
  );
}

// Sub-component for Checklist Node content
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
        {data.items?.map(item => (
          <ChecklistItem key={item.id} item={item} nodeId={id} data={data} />
        ))}
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

// Main Custom Node Component
export default function CustomNode({ id, data, selected }: NodeProps<NodeData>) {
  const nodeRef = useRef<HTMLDivElement>(null);

  const nodeColor = data.color || (data.type === 'checklist' ? '#3730a3' : '#374151');
  const selectedBorderColor = data.type === 'checklist' ? 'border-indigo-500' : 'border-blue-500';
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
      const newHeight = Math.max(50, startHeight + moveEvent.clientY - startY);
      if (nodeRef.current) {
        nodeRef.current.style.width = `${newWidth}px`;
        // 👇 **จุดที่แก้ไข:** เปลี่ยน newWidth เป็น newHeight
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
    <div
      ref={nodeRef}
      style={{ width: `${width}px`, height: `${height}px` }}
      className="relative"
    >
      <div 
        className={`w-full h-full border-2 rounded-lg shadow-md ${selected ? selectedBorderColor : 'border-gray-600'} flex flex-col overflow-hidden`}
        style={{ backgroundColor: nodeColor }}
      >
        {data.type === 'checklist' ? (
          <ChecklistNodeContent data={data} id={id} />
        ) : (
          <DefaultNodeContent data={data} id={id} />
        )}
      </div>

      <Handle type="target" position={Position.Top} className="!bg-gray-500 z-10" />
      <Handle type="source" position={Position.Bottom} className="!bg-gray-500 z-10" />
      
      {selected && (
        <button onClick={() => data.onDelete(id)} className="absolute -top-2 -right-2 bg-red-600 hover:bg-red-700 text-white rounded-full p-1 z-20"><Trash2 size={12} /></button>
      )}

      <div
        onMouseDown={onResizeStart}
        className="absolute bottom-0 right-0 w-4 h-4 bg-gray-500/50 hover:bg-gray-400 cursor-se-resize rounded-br-lg z-20 nodrag"
      />
    </div>
  );
}
