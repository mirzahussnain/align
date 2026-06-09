import { Scan, Briefcase, LineChart, ShieldCheck, TrendingUp, Target } from 'lucide-react';
import React from 'react';

export interface WorkflowNodeData {
  id: string;
  left: string;
  top: string;
  icon: React.ComponentType<{ size?: number | string; strokeWidth?: number | string }>;
  label: string;
}

export interface WorkflowJoint {
  cx: number;
  cy: number;
}

export interface WorkflowPathData {
  id: string;
  d: string;
  joints: WorkflowJoint[];
}

export interface WorkflowPulseData {
  pathId: string;
  dur: string;
  begin: string;
}

export const WORKFLOW_NODES: WorkflowNodeData[] = [
  { id: 'node1', left: '8.3%', top: '31.25%', icon: Scan, label: 'ATS Diagnostics' },
  { id: 'node2', left: '3.3%', top: '50.0%', icon: TrendingUp, label: 'Market Demand' },
  { id: 'node3', left: '8.3%', top: '68.75%', icon: Briefcase, label: 'Role Fit Signals' },
  { id: 'node4', left: '91.6%', top: '31.25%', icon: ShieldCheck, label: 'Visa Sponsor Filter' },
  { id: 'node5', left: '96.6%', top: '50.0%', icon: Target, label: 'Skill Gap Analysis' },
  { id: 'node6', left: '91.6%', top: '68.75%', icon: LineChart, label: 'Compensation Trends' },
];

export const WORKFLOW_PATHS: WorkflowPathData[] = [
  {
    id: 'path1',
    d: 'M -600 -450 L 100 250 L 180 250 L 230 300 L 280 300',
    joints: [{ cx: 180, cy: 250 }, { cx: 230, cy: 300 }]
  },
  {
    id: 'path2',
    d: 'M -600 450 L -10 450 L 40 400 L 200 400 L 230 370 L 280 370',
    joints: [{ cx: 200, cy: 400 }, { cx: 230, cy: 370 }]
  },
  {
    id: 'path3',
    d: 'M -600 1250 L 100 550 L 180 550 L 230 500 L 280 500',
    joints: [{ cx: 180, cy: 550 }, { cx: 230, cy: 500 }]
  },
  {
    id: 'path4',
    d: 'M 1800 -450 L 1100 250 L 1020 250 L 970 300 L 920 300',
    joints: [{ cx: 1020, cy: 250 }, { cx: 970, cy: 300 }]
  },
  {
    id: 'path5',
    d: 'M 1800 450 L 1210 450 L 1160 400 L 1000 400 L 970 370 L 920 370',
    joints: [{ cx: 1000, cy: 400 }, { cx: 970, cy: 370 }]
  },
  {
    id: 'path6',
    d: 'M 1800 1250 L 1100 550 L 1020 550 L 970 500 L 920 500',
    joints: [{ cx: 1020, cy: 550 }, { cx: 970, cy: 500 }]
  }
];

export const WORKFLOW_PULSES: WorkflowPulseData[] = [
  { pathId: '#path1', dur: '4s', begin: '0s' },
  { pathId: '#path2', dur: '5s', begin: '1s' },
  { pathId: '#path3', dur: '4.5s', begin: '0.5s' },
  { pathId: '#path4', dur: '4.2s', begin: '0.2s' },
  { pathId: '#path5', dur: '4.8s', begin: '1.5s' },
  { pathId: '#path6', dur: '5.1s', begin: '0.8s' }
];
