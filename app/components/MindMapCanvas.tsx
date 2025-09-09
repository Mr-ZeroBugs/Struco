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
} from 'react-flow-renderer';
import 'react-flow-renderer/dist/style.css';
import { User } from 'firebase/auth';
import { doc, setDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '@/app/firebase/config';
import { Save, Trash2, Palette } from 'lucide-react';
import CustomNode from './CustomNode';

interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

interface MindMapCanvasProps {
  user: User | null;
  planId: string | null;
}

const getNextId = (() => { let id = Date.now(); return () => `${id++}`; })();

export default function MindMapCanvas({ user, planId }: MindMapCanvasProps) {
    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [hasSelectedEdge, setHasSelectedEdge] = useState(false);
    const [viewport, setViewport] = useState<Viewport | null>(null);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const viewportTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        setHasSelectedEdge(edges.some(edge => edge.selected));
    }, [edges]);

    const onDeleteNode = useCallback((nodeId: string) => {
        setNodes((nds) => nds.filter((node) => node.id !== nodeId));
        setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    }, []);

    const handleNodeLabelChange = useCallback((nodeId: string, newText: string) => {
        setNodes((nds) =>
          nds.map((node) => {
            if (node.id === nodeId) {
              const keyToUpdate = node.data.type === 'checklist' ? 'title' : 'label';
              return { ...node, data: { ...node.data, [keyToUpdate]: newText } };
            }
            return node;
          })
        );
    }, []);

    const handleItemToggle = useCallback((nodeId: string, itemId: string) => {
        setNodes((nds) => nds.map((node) => {
            if (node.id === nodeId && node.data.items) {
                const newItems = node.data.items.map((item: ChecklistItem) => 
                    item.id === itemId ? { ...item, completed: !item.completed } : item
                );
                return { ...node, data: { ...node.data, items: newItems } };
            }
            return node;
        }));
    }, []);

    const handleItemUpdate = useCallback((nodeId: string, itemId: string, newText: string) => {
        setNodes((nds) => nds.map((node) => {
            if (node.id === nodeId && node.data.items) {
                const newItems = node.data.items.map((item: ChecklistItem) =>
                    item.id === itemId ? { ...item, text: newText } : item
                );
                return { ...node, data: { ...node.data, items: newItems } };
            }
            return node;
        }));
    }, []);

    const handleItemDelete = useCallback((nodeId: string, itemId: string) => {
        setNodes((nds) => nds.map((node) => {
            if (node.id === nodeId && node.data.items) {
                const newItems = node.data.items.filter((item: ChecklistItem) => item.id !== itemId);
                return { ...node, data: { ...node.data, items: newItems } };
            }
            return node;
        }));
    }, []);

    const handleAddItem = useCallback((nodeId: string, newItemText: string) => {
        setNodes((nds) => nds.map((node) => {
            if (node.id === nodeId) {
                const newItem: ChecklistItem = { id: getNextId(), text: newItemText, completed: false };
                const newItems = [...(node.data.items || []), newItem];
                return { ...node, data: { ...node.data, items: newItems } };
            }
            return node;
        }));
    }, []);

    const handleNodeColorChange = (color: string) => {
        if (!selectedNode) return;
        setNodes((nds) =>
            nds.map((node) => 
                node.id === selectedNode.id ? { ...node, data: { ...node.data, color } } : node
            )
        );
    };

    const handleNodeResize = useCallback((nodeId: string, newSize: { width: number; height: number }) => {
        setNodes((nds) =>
            nds.map((node) =>
                node.id === nodeId
                    ? { ...node, data: { ...node.data, width: newSize.width, height: newSize.height } }
                    : node
            )
        );
    }, []);
    
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
        }} />
    }), [onDeleteNode, handleNodeLabelChange, handleNodeResize, handleItemToggle, handleAddItem, handleItemUpdate, handleItemDelete]);

    useEffect(() => {
        if (!planId || !user || isLoading) return;
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        setIsSaving(true);
        saveTimeoutRef.current = setTimeout(async () => {
            const nodesToSave = nodes.map(({ data, ...rest }) => {
                const baseData = { 
                    color: data.color || null,
                    width: data.width || null,
                    height: data.height || null,
                }; 
                if (data.type === 'checklist') {
                    return { ...rest, data: { ...baseData, type: 'checklist', title: data.title ?? '', items: data.items ?? [] } };
                }
                return { ...rest, data: { ...baseData, type: 'default', label: data.label ?? '' } };
            });
            const planRef = doc(db, 'users', user.uid, 'plans', planId);
            try {
                await setDoc(planRef, { nodes: nodesToSave, edges }, { merge: true });
            } catch (err) {
                console.error("Error saving data:", err);
            } finally {
                setIsSaving(false);
            }
        }, 1500);
        return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
    }, [nodes, edges, user, planId, isLoading]);

    useEffect(() => {
      if (!user || !planId) { setIsLoading(false); return; }
      setIsLoading(true);
      const planRef = doc(db, 'users', user.uid, 'plans', planId);
      const unsubscribe = onSnapshot(planRef, (docSnap) => {
          if (docSnap.exists()) {
              const data = docSnap.data();
              setNodes(data.nodes || []);
              setEdges(data.edges || []);
              if (data.viewport) {
                  setViewport(data.viewport); 
              }
          }
          setIsLoading(false);
      });
      return () => unsubscribe();
    }, [user, planId]);

    const handleDeleteSelectedEdges = useCallback(() => {
        setEdges((eds) => eds.filter(edge => !edge.selected));
    }, []);

    const onNodesChange: OnNodesChange = useCallback((changes) => {
        setNodes((nds) => {
            const nextNodes = applyNodeChanges(changes, nds);
            const selected = nextNodes.find(n => n.selected);
            setSelectedNode(selected || null);
            return nextNodes;
        });
    }, [nodes]);

    const onEdgesChange: OnEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
    const onConnect: OnConnect = useCallback((connection) => setEdges((eds) => addEdge(connection, eds)), []);

    const onAddNode = useCallback(() => {
        const newNode = {
            id: getNextId(),
            type: 'custom',
            data: { type: 'default', label: 'New Node', width: 150, height: 50 },
            position: { x: Math.random() * 200, y: Math.random() * 200 },
        };
        setNodes((nds) => nds.concat(newNode));
    }, []);

    const onAddChecklistNode = useCallback(() => {
        const newNode = {
            id: getNextId(),
            type: 'custom',
            data: { 
                type: 'checklist', 
                title: 'My To-do List', 
                items: [{id: getNextId(), text: 'First item', completed: false}],
                width: 250,
                height: 100
            },
            position: { x: Math.random() * 200, y: Math.random() * 200 },
        };
        setNodes((nds) => nds.concat(newNode));
    }, []);

    const onMoveEnd = useCallback((event: React.MouseEvent | React.TouchEvent | undefined, vp: Viewport) => {
        if (viewportTimeoutRef.current) clearTimeout(viewportTimeoutRef.current);
        viewportTimeoutRef.current = setTimeout(() => {
            if(user && planId) {
                const planRef = doc(db, 'users', user.uid, 'plans', planId);
                updateDoc(planRef, { viewport: vp });
            }
        }, 1000);
    }, [user, planId]);
    
    if (isLoading) { return <div className="p-8 text-white text-center">Loading Canvas...</div>; }

    return (
        <div className="h-full w-full bg-gray-900 relative">
            <div className="absolute top-4 right-4 z-10 flex items-center space-x-2">
                {isSaving && (
                    <div className="flex items-center text-gray-300 text-sm"><Save className="animate-pulse h-4 w-4 mr-2" />Saving...</div>
                )}
                
                {hasSelectedEdge && (
                    <button 
                        onClick={handleDeleteSelectedEdges}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg shadow hover:bg-red-700 transition flex items-center gap-2"
                        aria-label="Delete selected edge"
                    >
                        <Trash2 size={16}/>
                        <span className="hidden sm:inline">Delete Line</span>
                    </button>
                )}
                
                <button onClick={onAddChecklistNode} className="px-4 py-2 bg-indigo-600 text-white rounded-lg shadow hover:bg-indigo-700 transition">Add Checklist</button>
                <button onClick={onAddNode} className="px-4 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition">Add Node</button>
            </div>

            {selectedNode && (
                <div className="absolute top-4 left-4 z-10 bg-gray-800 p-2 rounded-lg shadow-lg flex items-center gap-2">
                    <Palette size={16} className="text-gray-400"/>
                    {['#374151', '#b91c1c', '#0f766e', '#1d4ed8', '#581c87', '#b45309'].map(color => (
                        <button 
                            key={color}
                            onClick={() => handleNodeColorChange(color)}
                            className="w-6 h-6 rounded-full border-2 border-transparent hover:border-white transition"
                            style={{ backgroundColor: color }}
                        />
                    ))}
                </div>
            )}
            
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                defaultPosition={viewport ? [viewport.x, viewport.y] : undefined}
                defaultZoom={viewport ? viewport.zoom : undefined}
                deleteKeyCode="Backspace"
            >
                <Controls />
                <Background color="#666" gap={16} />
            </ReactFlow>
        </div>
    );
}
