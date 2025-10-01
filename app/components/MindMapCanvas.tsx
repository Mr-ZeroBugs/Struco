'use client';

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import ReactFlow, {
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Node,
  Edge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  NodeProps,
  Viewport,
  MarkerType,
  ReactFlowInstance,
} from 'react-flow-renderer';
import { User } from 'firebase/auth';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/app/firebase/config';
import { Save, Trash2, Palette, Focus, Filter, Tag, X } from 'lucide-react';
import CustomNode from './CustomNode';

// --- TYPE DEFINITIONS ---
interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

interface MindMapCanvasProps {
  user: User | null;
  planId: string | null;
}

// --- UTILITY FUNCTIONS ---
const getNextId = (() => { let id = Date.now(); return () => `${id++}`; })();

// --- MAIN COMPONENT ---
export default function MindMapCanvas({ user, planId }: MindMapCanvasProps) {
    // --- STATE MANAGEMENT ---
    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    
    // Viewport State
    const [viewport, setViewport] = useState<Viewport | null>(null);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const viewportTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const reactFlowInstance = useRef<ReactFlowInstance | null>(null);

    // 🔧 FIX: ป้องกัน Firebase overwrite ข้อมูลที่กำลังแก้ไข
    const isLocalUpdateRef = useRef(false);
    const pendingSaveRef = useRef(false);

    // Focus Mode State
    const [isFocusMode, setIsFocusMode] = useState(false);
    const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);

    // Tag & Filter State
    const [showTagPanel, setShowTagPanel] = useState(false);
    const [availableTags, setAvailableTags] = useState<string[]>(['#idea', '#task', '#important', '#research']);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [newTag, setNewTag] = useState('');

    // Edge Label State
    const [showEdgeLabelModal, setShowEdgeLabelModal] = useState(false);
    const [editingEdge, setEditingEdge] = useState<Edge | null>(null);
    const [edgeLabel, setEdgeLabel] = useState('');
    const [hasSelectedEdge, setHasSelectedEdge] = useState(false);

    const defaultEdgeOptions = {
        style: { strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed },
        labelStyle: { fill: '#ffffff', fontWeight: 500 },
        labelBgStyle: { fill: '#1f2937', fillOpacity: 0.9 },
        labelBgPadding: [8, 4] as [number, number],
        labelBgBorderRadius: 4,
    };
    
    // --- DATA PERSISTENCE (FIREBASE) ---
    // Load data from Firebase
    useEffect(() => {
      if (!user || !planId) { setIsLoading(false); return; }
      setIsLoading(true);
      const planRef = doc(db, 'users', user.uid, 'plans', planId);
      const unsubscribe = onSnapshot(planRef, (docSnap) => {
          if (isLocalUpdateRef.current || pendingSaveRef.current) {
              return;
          }

          if (docSnap.exists()) {
              const data = docSnap.data();
              setNodes(data.nodes || []);
              setEdges(data.edges || []);
              setViewport(data.viewport || null);
              setAvailableTags(data.availableTags || ['#idea', '#task', '#important']);
          }
          setIsLoading(false);
      });
      return () => unsubscribe();
    }, [user, planId]);

    // 🔧 FIX: Auto-save data to Firebase (ป้องกัน race condition)
    useEffect(() => {
        if (isLoading) return;

        // 🔧 FIX: ถ้า state update ไม่ได้มาจากการกระทำของผู้ใช้ (local) ไม่ต้อง save
        if (!isLocalUpdateRef.current) return;

        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        
        pendingSaveRef.current = true;
        setIsSaving(true);
        
        saveTimeoutRef.current = setTimeout(async () => {
            if (!user || !planId) {
                pendingSaveRef.current = false;
                return;
            }

            const nodesToSave = nodes.map(({ data, ...rest }) => {
                const baseData = { 
                    color: data.color || null,
                    width: data.width || null,
                    height: data.height || null,
                    tags: data.tags || [],
                }; 
                if (data.type === 'checklist') {
                    return { ...rest, data: { ...baseData, type: 'checklist', title: data.title ?? '', items: data.items ?? [] } };
                }
                return { ...rest, data: { ...baseData, type: 'default', label: data.label ?? '' } };
            });

            try {
                const planRef = doc(db, 'users', user.uid, 'plans', planId);
                // 🔧 FIX: รวมการบันทึก viewport ไว้ที่นี่เพื่อความเสถียร
                const currentViewport = reactFlowInstance.current?.getViewport();
                await setDoc(planRef, { 
                    nodes: nodesToSave, 
                    edges, 
                    availableTags,
                    viewport: currentViewport || null
                }, { merge: true });

            } catch (err) {
                console.error("Error saving data:", err);
            } finally {
                setIsSaving(false);
                pendingSaveRef.current = false;
                // 🔧 FIX: รีเซ็ต Flag ที่นี่ หลังจาก Save เสร็จแล้วเท่านั้น
                isLocalUpdateRef.current = false;
            }
        }, 1500);

        return () => { 
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); 
        };
    }, [nodes, edges, availableTags, user, planId, isLoading]);
    
    // --- FOCUS MODE LOGIC ---
    const getRelatedNodes = useCallback((nodeId: string): Set<string> => {
        const related = new Set<string>([nodeId]);
        edges.forEach(edge => {
            if (edge.target === nodeId) related.add(edge.source);
            if (edge.source === nodeId) related.add(edge.target);
        });
        return related;
    }, [edges]);

    // --- NODE & EDGE FILTERING ---
    const filteredNodes = useMemo(() => {
        let result = nodes.map(node => ({ ...node, hidden: false }));

        if (isFocusMode && focusedNodeId) {
            const relatedNodeIds = getRelatedNodes(focusedNodeId);
            result = result.map(node => ({
                ...node,
                hidden: !relatedNodeIds.has(node.id)
            }));
        }

        if (selectedTags.length > 0) {
            result = result.map(node => {
                const nodeTags = node.data.tags || [];
                const hasMatchingTag = selectedTags.some(tag => nodeTags.includes(tag));
                return {
                    ...node,
                    hidden: node.hidden || !hasMatchingTag
                };
            });
        }
        return result;
    }, [nodes, isFocusMode, focusedNodeId, selectedTags, getRelatedNodes]);

    const filteredEdges = useMemo(() => {
        const visibleNodeIds = new Set(filteredNodes.filter(n => !n.hidden).map(n => n.id));
        return edges.map(edge => ({
            ...edge,
            hidden: !visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)
        }));
    }, [edges, filteredNodes]);

    // --- EVENT HANDLERS & CALLBACKS ---
    const onNodesChange: OnNodesChange = useCallback((changes) => {
        isLocalUpdateRef.current = true;
        setNodes((nds) => {
            const nextNodes = applyNodeChanges(changes, nds);
            setSelectedNode(nextNodes.find(n => n.selected) || null);
            return nextNodes;
        });
        // 🔧 FIX: ลบ setTimeout ออก
    }, []);

    const onEdgesChange: OnEdgesChange = useCallback((changes) => {
        isLocalUpdateRef.current = true;
        setEdges((eds) => {
            const nextEdges = applyEdgeChanges(changes, eds);
            setHasSelectedEdge(nextEdges.some(e => e.selected));
            return nextEdges;
        });
        // 🔧 FIX: ลบ setTimeout ออก
    }, []);

    const onConnect: OnConnect = useCallback((connection) => {
        isLocalUpdateRef.current = true;
        setEdges((eds) => addEdge(connection, eds));
        // 🔧 FIX: ลบ setTimeout ออก
    }, []);
    
    // โค้ดส่วน onMoveEnd จะถูกจัดการโดย Auto-save effect หลักแล้ว แต่เก็บฟังก์ชันไว้ตามเดิม
    const onMoveEnd = useCallback((_event: MouseEvent | TouchEvent, vp: Viewport) => {
        isLocalUpdateRef.current = true; // แค่ตั้ง flag ให้ auto-save ทำงาน
    }, [user, planId]);

    const onAddNode = useCallback((type: 'default' | 'checklist') => {
        isLocalUpdateRef.current = true;
        
        const newNodeData = type === 'checklist' 
            ? { type: 'checklist', title: 'My To-do List', items: [{id: getNextId(), text: 'First item', completed: false}], width: 250, height: 120, tags: [] } 
            : { type: 'default', label: 'New Node', width: 150, height: 50, tags: [] };
        
        const centerX = reactFlowInstance.current 
            ? (window.innerWidth / 2 - reactFlowInstance.current.getViewport().x) / reactFlowInstance.current.getViewport().zoom 
            : 250;
        const centerY = reactFlowInstance.current 
            ? (window.innerHeight / 2 - reactFlowInstance.current.getViewport().y) / reactFlowInstance.current.getViewport().zoom 
            : 150;
        
        const newNode = { 
            id: getNextId(), 
            type: 'custom', 
            data: newNodeData, 
            position: { 
                x: centerX + (Math.random() - 0.5) * 100, 
                y: centerY + (Math.random() - 0.5) * 100 
            } 
        };
        
        setNodes((nds) => [...nds, newNode]);
        // 🔧 FIX: ลบ setTimeout ออก
    }, []);
    
    const onDeleteNode = useCallback((nodeId: string) => {
        isLocalUpdateRef.current = true;
        setNodes((nds) => nds.filter((node) => node.id !== nodeId));
        setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
        // 🔧 FIX: ลบ setTimeout ออก
    }, []);

    const handleNodeLabelChange = useCallback((nodeId: string, newText: string) => {
        isLocalUpdateRef.current = true;
        setNodes((nds) => nds.map((node) => {
            if (node.id === nodeId) {
                const keyToUpdate = node.data.type === 'checklist' ? 'title' : 'label';
                return { ...node, data: { ...node.data, [keyToUpdate]: newText } };
            }
            return node;
        }));
        // 🔧 FIX: ลบ setTimeout ออก
    }, []);

    const handleNodeResize = useCallback((nodeId: string, newSize: { width: number; height: number }) => {
        isLocalUpdateRef.current = true;
        setNodes((nds) => nds.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, width: newSize.width, height: newSize.height } } : node));
        // 🔧 FIX: ลบ setTimeout ออก
    }, []);
    
    const handleNodeColorChange = (color: string) => {
        if (!selectedNode) return;
        isLocalUpdateRef.current = true;
        setNodes((nds) => nds.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, color } } : node));
        // 🔧 FIX: ลบ setTimeout ออก
    };

    // Checklist Item Actions
    const handleItemToggle = useCallback((nodeId: string, itemId: string) => {
        isLocalUpdateRef.current = true;
        setNodes((nds) => nds.map((node) => {
            if (node.id === nodeId && node.data.items) {
                const newItems = node.data.items.map((item: ChecklistItem) => item.id === itemId ? { ...item, completed: !item.completed } : item);
                return { ...node, data: { ...node.data, items: newItems } };
            }
            return node;
        }));
        // 🔧 FIX: ลบ setTimeout ออก
    }, []);

    const handleItemUpdate = useCallback((nodeId: string, itemId: string, newText: string) => {
        isLocalUpdateRef.current = true;
        setNodes((nds) => nds.map((node) => {
            if (node.id === nodeId && node.data.items) {
                const newItems = node.data.items.map((item: ChecklistItem) => item.id === itemId ? { ...item, text: newText } : item);
                return { ...node, data: { ...node.data, items: newItems } };
            }
            return node;
        }));
        // 🔧 FIX: ลบ setTimeout ออก
    }, []);

    const handleItemDelete = useCallback((nodeId: string, itemId: string) => {
        isLocalUpdateRef.current = true;
        setNodes((nds) => nds.map((node) => {
            if (node.id === nodeId && node.data.items) {
                const newItems = node.data.items.filter((item: ChecklistItem) => item.id !== itemId);
                return { ...node, data: { ...node.data, items: newItems } };
            }
            return node;
        }));
        // 🔧 FIX: ลบ setTimeout ออก
    }, []);
    
    const handleAddItem = useCallback((nodeId: string, newItemText: string) => {
        isLocalUpdateRef.current = true;
        setNodes((nds) => nds.map((node) => {
            if (node.id === nodeId) {
                const newItem: ChecklistItem = { id: getNextId(), text: newItemText, completed: false };
                const newItems = [...(node.data.items || []), newItem];
                return { ...node, data: { ...node.data, items: newItems } };
            }
            return node;
        }));
        // 🔧 FIX: ลบ setTimeout ออก
    }, []);

    // Tag Actions
    const handleAddTag = () => {
        const trimmedTag = newTag.trim();
        if (trimmedTag && !availableTags.includes(trimmedTag)) {
            // การแก้ไข availableTags จะ trigger useEffect หลักให้ save อัตโนมัติ
            isLocalUpdateRef.current = true;
            setAvailableTags([...availableTags, trimmedTag]);
            setNewTag('');
        }
    };

    const handleToggleNodeTag = useCallback((nodeId: string, tag: string) => {
        isLocalUpdateRef.current = true;
        setNodes((nds) => nds.map((node) => {
            if (node.id === nodeId) {
                const currentTags = node.data.tags || [];
                const newTags = currentTags.includes(tag) ? currentTags.filter((t: string) => t !== tag) : [...currentTags, tag];
                return { ...node, data: { ...node.data, tags: newTags } };
            }
            return node;
        }));
        // 🔧 FIX: ลบ setTimeout ออก
    }, []);

    const handleToggleTagFilter = (tag: string) => {
        setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
    };

    const handleDeleteTag = (tagToDelete: string) => {
        isLocalUpdateRef.current = true;
        setAvailableTags(prev => prev.filter(t => t !== tagToDelete));
        setSelectedTags(prev => prev.filter(t => t !== tagToDelete));
        setNodes((nds) => nds.map((node) => ({
            ...node,
            data: {
                ...node.data,
                tags: (node.data.tags || []).filter((t: string) => t !== tagToDelete)
            }
        })));
        // 🔧 FIX: ลบ setTimeout ออก
    };

    const getTagUsageCount = (tag: string) => {
        return nodes.filter(node => (node.data.tags || []).includes(tag)).length;
    };

    // Focus Mode Action
    const handleToggleFocusMode = () => {
        if (!selectedNode) return;
        if (isFocusMode && focusedNodeId === selectedNode.id) {
            setIsFocusMode(false);
            setFocusedNodeId(null);
        } else {
            setIsFocusMode(true);
            setFocusedNodeId(selectedNode.id);
        }
    };

    // Edge Actions
    const handleEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
        setEditingEdge(edge);
        setEdgeLabel(edge.label as string || '');
        setShowEdgeLabelModal(true);
    }, []);
    
    const handleDeleteSelectedEdges = useCallback(() => {
        isLocalUpdateRef.current = true;
        setEdges((eds) => eds.filter(edge => !edge.selected));
        // 🔧 FIX: ลบ setTimeout ออก
    }, []);

    const handleSaveEdgeLabel = () => {
        if (!editingEdge) return;
        isLocalUpdateRef.current = true;
        setEdges((eds) => eds.map((edge) =>
            edge.id === editingEdge.id
                ? { 
                    ...edge, 
                    label: edgeLabel,
                    labelStyle: { fill: '#ffffff', fontWeight: 500 },
                    labelBgStyle: { fill: '#1f2937', fillOpacity: 0.9 },
                    labelBgPadding: [8, 4] as [number, number],
                    labelBgBorderRadius: 4
                  }
                : edge
        ));
        setShowEdgeLabelModal(false);
        setEditingEdge(null);
        // 🔧 FIX: ลบ setTimeout ออก
    };

    // --- NODE TYPES ---
    const nodeTypes = useMemo(() => ({
        custom: (props: NodeProps) => <CustomNode {...props} data={{
            ...props.data, 
            onDelete: onDeleteNode, 
            onLabelChange: handleNodeLabelChange,
            onResize: handleNodeResize,
            onItemToggle: handleItemToggle,
            onAddItem: handleAddItem,
            onItemUpdate: handleItemUpdate,
            onItemDelete: handleItemDelete,
            onToggleTag: handleToggleNodeTag,
            availableTags: availableTags,
        }} />
    }), [onDeleteNode, handleNodeLabelChange, handleNodeResize, handleItemToggle, handleAddItem, handleItemUpdate, handleItemDelete, handleToggleNodeTag, availableTags]);

    // --- RENDER ---
    if (isLoading) { return <div className="p-8 text-white text-center">Loading Canvas...</div>; }

    return (
        <div className="h-full w-full bg-gray-900 relative">
             <style>{`
                 .react-flow__edge-path { stroke-width: 2; cursor: pointer; }
                 .react-flow__edge-path:hover { stroke-width: 3; }
                 .react-flow__edge.selected .react-flow__edge-path { stroke: #60a5fa; stroke-width: 3; }
                 .react-flow__edge-interaction { stroke-width: 20 !important; stroke: transparent; }
                 .react-flow__edge-text { fill: #ffffff; font-size: 12px; font-weight: 500; }
                 .react-flow__edge-textbg { fill: #1f2937; fill-opacity: 0.9; rx: 4; }
             `}</style>
            
            {/* UI Overlays */}
            <div className="absolute top-4 right-4 z-10 flex items-center space-x-2">
                {isSaving && <div className="flex items-center text-gray-300 text-sm"><Save className="animate-pulse h-4 w-4 mr-2" />Saving...</div>}
                {hasSelectedEdge && <button onClick={handleDeleteSelectedEdges} className="px-4 py-2 bg-red-600 text-white rounded-lg shadow hover:bg-red-700 transition flex items-center gap-2"><Trash2 size={16}/><span className="hidden sm:inline">Delete Line</span></button>}
                {selectedNode && <button onClick={handleToggleFocusMode} className={`px-4 py-2 rounded-lg shadow transition flex items-center gap-2 ${isFocusMode && focusedNodeId === selectedNode.id ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-700 hover:bg-gray-600'} text-white`}><Focus size={16}/><span className="hidden sm:inline">{isFocusMode && focusedNodeId === selectedNode.id ? 'Exit Focus' : 'Focus Mode'}</span></button>}
                <button onClick={() => setShowTagPanel(!showTagPanel)} className={`px-4 py-2 rounded-lg shadow transition flex items-center gap-2 ${showTagPanel ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-700 hover:bg-gray-600'} text-white`}><Filter size={16}/><span className="hidden sm:inline">Tags</span></button>
                <button onClick={() => onAddNode('checklist')} className="px-4 py-2 bg-indigo-600 text-white rounded-lg shadow hover:bg-indigo-700 transition">Add Checklist</button>
                <button onClick={() => onAddNode('default')} className="px-4 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition">Add Node</button>
            </div>

            {selectedNode && (
                <div className="absolute top-4 left-4 z-10 bg-gray-800 p-2 rounded-lg shadow-lg flex items-center gap-2">
                    <Palette size={16} className="text-gray-400"/>
                    {['#374151', '#b91c1c', '#0f766e', '#1d4ed8', '#581c87', '#b45309'].map(color => <button key={color} onClick={() => handleNodeColorChange(color)} className="w-6 h-6 rounded-full border-2 border-transparent hover:border-white transition" style={{ backgroundColor: color }} />)}
                </div>
            )}

            {showTagPanel && (
                <div className="absolute top-20 right-4 z-10 bg-gray-800 p-4 rounded-lg shadow-lg w-72 max-h-96 overflow-y-auto">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-white font-semibold flex items-center gap-2"><Tag size={18} />Tag Manager</h3>
                        <button onClick={() => setShowTagPanel(false)} className="text-gray-400 hover:text-white"><X size={18} /></button>
                    </div>
                    <div className="mb-4">
                        <div className="flex gap-2">
                            <input type="text" value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddTag()} placeholder="New tag..." className="flex-1 bg-gray-700 text-white px-3 py-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            <button onClick={handleAddTag} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm transition">Add</button>
                        </div>
                    </div>
                    <div className="mb-3">
                        <p className="text-gray-400 text-xs mb-2">Available tags:</p>
                        <div className="space-y-2">
                            {availableTags.map(tag => {
                                const usageCount = getTagUsageCount(tag);
                                return (
                                    <div key={tag} className="flex items-center justify-between bg-gray-700 px-3 py-2 rounded group">
                                        <button onClick={() => handleToggleTagFilter(tag)} className={`flex-1 text-left text-xs transition ${selectedTags.includes(tag) ? 'text-blue-400 font-semibold' : 'text-gray-300'}`}>
                                            {tag} <span className="text-gray-500">({usageCount})</span>
                                        </button>
                                        <button onClick={() => handleDeleteTag(tag)} className="opacity-0 group-hover:opacity-100 ml-2 text-red-400 hover:text-red-300 transition" title="Delete tag">
                                            <X size={14} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                        {selectedTags.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-700">
                                <p className="text-gray-400 text-xs mb-2">Active filters:</p>
                                <div className="flex flex-wrap gap-2">
                                    {selectedTags.map(tag => <span key={tag} className="px-2 py-1 bg-blue-600 text-white rounded-full text-xs">{tag}</span>)}
                                </div>
                                <button onClick={() => setSelectedTags([])} className="mt-2 text-xs text-red-400 hover:text-red-300">Clear all filters</button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showEdgeLabelModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={() => setShowEdgeLabelModal(false)}>
                    <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-96" onMouseDown={(e) => e.stopPropagation()}>
                        <h3 className="text-white text-lg font-semibold mb-4">Connection Label</h3>
                        <input type="text" value={edgeLabel} onChange={(e) => setEdgeLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSaveEdgeLabel()} placeholder="e.g., related to, causes..." className="w-full bg-gray-700 text-white px-4 py-2 rounded mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setShowEdgeLabelModal(false)} className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition">Cancel</button>
                            <button onClick={handleSaveEdgeLabel} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition">Save</button>
                        </div>
                    </div>
                </div>
            )}
            
            <ReactFlow
                nodes={filteredNodes}
                edges={filteredEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onEdgeClick={handleEdgeClick}
                nodeTypes={nodeTypes}
                onInit={(instance) => { 
                    reactFlowInstance.current = instance;
                    if (viewport) {
                        instance.setViewport(viewport);
                    }
                }}
                deleteKeyCode="Backspace"
                onMoveEnd={onMoveEnd}
                defaultEdgeOptions={defaultEdgeOptions}
                connectionLineStyle={{ stroke: '#fff', strokeWidth: 2 }}
                fitView={nodes.length < 2 && !viewport} // fitView on initial load only
                fitViewOptions={{ padding: 0.2 }}
            >
                <Controls />
                <Background color="#666" gap={16} />
            </ReactFlow>
        </div>
    );
}