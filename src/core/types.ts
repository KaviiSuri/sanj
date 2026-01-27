/**
 * Core type definitions for the Sanj application.
 *
 * This file establishes the foundational TypeScript types used throughout the codebase.
 * These types define the domain model for sessions, observations, patterns, configuration,
 * and the memory hierarchy.
 */

// =============================================================================
// Session Types
// =============================================================================

/**
 * Represents a single conversation/session from Claude Code or OpenCode.
 */
export interface Session {
  /** Unique session identifier (varies by tool format) */
  id: string;

  /** Source tool (determines which adapter reads it) */
  tool: 'claude-code' | 'opencode';

  /** Project identifier (optional, tools may not always provide) */
  projectSlug?: string;

  /** Session creation timestamp */
  createdAt: Date;

  /** Last message timestamp */
  modifiedAt: Date;

  /** Filesystem path to session file */
  path: string;

  /** Approximate conversation length */
  messageCount: number;
}

/**
 * Represents a single turn in a conversation.
 */
export interface Message {
  /** Message sender ('user' or 'assistant') */
  role: 'user' | 'assistant';

  /** Message text */
  content: string;

  /** When message was sent (optional, some tools may not provide) */
  timestamp?: Date;
}

// =============================================================================
// Observation Types
// =============================================================================

/**
 * Represents a single extracted pattern or insight.
 */
export interface Observation {
  /** Unique identifier for this observation */
  id: string;

  /** Human-readable observation text */
  text: string;

  /** Observation type (helps with organization and filtering) */
  category?: 'preference' | 'pattern' | 'workflow' | 'tool-choice' | 'style' | 'other';

  /** How many times this pattern has been detected */
  count: number;

  /** Current lifecycle state */
  status: 'pending' | 'approved' | 'denied' | 'promoted-to-long-term' | 'promoted-to-core';

  /** Which sessions this observation came from */
  sourceSessionIds: string[];

  /** When first detected */
  firstSeen: Date;

  /** When last updated */
  lastSeen: Date;

  /** Optional semantic tags for searching */
  tags?: string[];

  /** Arbitrary extensibility */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Extraction Types
// =============================================================================

/**
 * Result returned by LLMAdapter when extracting patterns from a session.
 */
export interface ExtractionResult {
  /** List of extracted patterns */
  observations: Observation[];

  /** Optional processing details */
  metadata?: {
    processingTime?: number;
    tokensUsed?: number;
    model?: string;
  };
}

/**
 * Result of LLM-based semantic similarity check.
 */
export interface SimilarityResult {
  /** Whether observations are semantically similar */
  isSimilar: boolean;

  /** How confident the check is (0.0 to 1.0) */
  confidence: number;

  /** Optional explanation of the comparison */
  reason?: string;
}

// =============================================================================
// Memory Hierarchy Types
// =============================================================================

/**
 * Represents an observation that has been promoted to long-term memory.
 */
export interface LongTermMemory {
  /** Unique identifier at this level */
  id: string;

  /** Reference to the observation being promoted */
  observation: Observation;

  /** When promotion occurred */
  promotedAt: Date;

  /** Current state in lifecycle */
  status: 'approved' | 'scheduled-for-core' | 'denied';
}

/**
 * Represents a memory item that has been promoted to core memory.
 */
export interface CoreMemory {
  /** Unique identifier at this level */
  id: string;

  /** Reference to the long-term memory being promoted */
  longTermMemory: LongTermMemory;

  /** When written to core memory */
  writtenAt: Date;

  /** Where core memory was written */
  targetFile: 'CLAUDE.md' | 'AGENTS.md';
}

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * User configuration stored in config.json.
 */
export interface Config {
  /** Config schema version */
  version: string;

  /** Which LLM to use for pattern extraction */
  llmAdapter: {
    type: 'opencode' | 'claude-code';
    model?: string;
  };

  /** Which tools to monitor */
  sessionAdapters: {
    claudeCode: boolean;
    opencode: boolean;
  };

  /** Where to write approved memories */
  memoryTargets: {
    claudeMd: boolean;
    agentsMd: boolean;
  };

  /** Analysis parameters (look-back window, similarity threshold) */
  analysis: {
    windowDays?: number;
    similarityThreshold?: number;
  };

  /** Thresholds for automatic promotion suggestions */
  promotion: {
    observationCountThreshold: number;
    longTermDaysThreshold: number;
  };

  /** Optional scheduling configuration */
  cron?: {
    analysisSchedule?: string;
    promotionSchedule?: string;
  };

  /** Extensibility */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// State/Tracking Types
// =============================================================================

/**
 * Track system state across runs (stored in state.json).
 */
export interface AnalysisState {
  /** When analysis last completed successfully */
  lastAnalysisRun?: Date;

  /** Error message from last failed run */
  lastAnalysisError?: string;

  /** Position tracking for incremental reads (optional optimization) */
  sessionCursors?: Record<string, string>; // tool -> cursor position

  /** Total observations currently stored */
  observationCount: number;

  /** Total long-term memories */
  longTermMemoryCount: number;

  /** Total items promoted to core memory */
  coreMemoryCount: number;
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Standardized error class for Sanj application.
 *
 * Provides machine-readable error codes and optional context for debugging.
 */
export class SanjError extends Error {
  /** Machine-readable error code for programmatic handling */
  code: string;

  /** Optional additional context (e.g., which file failed, which adapter) */
  context?: Record<string, unknown>;

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message);
    this.name = 'SanjError';
    this.code = code;
    this.context = context;
  }
}

/**
 * Enumeration of all possible error codes in the Sanj application.
 */
export enum ErrorCode {
  CONFIG_MISSING = 'CONFIG_MISSING',
  CONFIG_INVALID = 'CONFIG_INVALID',
  SESSION_READ_FAILED = 'SESSION_READ_FAILED',
  LLM_CALL_FAILED = 'LLM_CALL_FAILED',
  OBSERVATION_STORE_FAILED = 'OBSERVATION_STORE_FAILED',
  ADAPTER_UNAVAILABLE = 'ADAPTER_UNAVAILABLE',
  FILE_WRITE_FAILED = 'FILE_WRITE_FAILED',
  INVALID_STATE = 'INVALID_STATE',
}

// =============================================================================
// Adapter Result Types
// =============================================================================

/**
 * Result of checking whether an adapter is available for use.
 */
export interface AdapterAvailabilityCheck {
  /** Whether adapter can be used */
  available: boolean;

  /** Why not available (if applicable) */
  reason?: string;
}

/**
 * Standardized return type for adapter operations.
 *
 * @template T - The type of data returned on success
 */
export interface AdapterOperation<T> {
  /** Did the operation succeed */
  success: boolean;

  /** Result data (present if success is true) */
  data?: T;

  /** Error details (present if success is false) */
  error?: SanjError;
}
