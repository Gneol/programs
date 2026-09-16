import React, { useState, useCallback, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'

// Types
export interface PromptOption {
  label: string
  value: string
}

export interface PromptConfig {
  message: string
  options?: PromptOption[]
  type?: 'confirm' | 'select' | 'text'
  defaultValue?: string
  validate?: (input: string) => boolean | string
  maxLines?: number
}

// Default cap for how many message lines are rendered inline before truncating.
const MAX_MESSAGE_LINES = 12

// Split a prompt message into displayable lines, clipping to maxLines and
// appending a hint when content is hidden (full text is available elsewhere).
const getMessageLines = (config: PromptConfig): string[] => {
  const all = config.message.trim().split('\n').filter(line => line.trim())
  const max = config.maxLines ?? MAX_MESSAGE_LINES
  if (all.length <= max) return all
  return [
    ...all.slice(0, max),
    `… (+${all.length - max} more lines hidden)`,
  ]
}

interface PromptState {
  active: boolean
  config: PromptConfig | null
  selectedIndex: number
  inputValue: string
  error: string | null
  resolve: ((value: string) => void) | null
}

// Default options for confirm prompts (clack-style)
const CONFIRM_OPTIONS: PromptOption[] = [
  { label: 'Yes', value: 'yes' },
  { label: 'No', value: 'no' },
]

// Global prompt function (set by hook)
let globalShowPrompt: ((config: PromptConfig) => Promise<string>) | null = null

export const showPrompt = (config: PromptConfig): Promise<string> => {
  if (!globalShowPrompt) {
    return Promise.reject(new Error('Prompt system not initialized'))
  }
  return globalShowPrompt(config)
}

// Convenience function for yes/no confirmation
export const confirm = (message: string): Promise<boolean> => {
  return showPrompt({ message, type: 'confirm' }).then(v => v === 'yes')
}

// Convenience function for text input
export const text = (message: string, options?: {
  defaultValue?: string
  validate?: (input: string) => boolean | string
}): Promise<string> => {
  return showPrompt({ 
    message, 
    type: 'text',
    defaultValue: options?.defaultValue,
    validate: options?.validate
  })
}

// Convenience function for select/multiple choice
export const select = (message: string, options: PromptOption[]): Promise<string> => {
  return showPrompt({ message, type: 'select', options })
}

// Hook to manage prompt state - use this directly in ChatApp
export const usePromptState = () => {
  const [state, setState] = useState<PromptState>({
    active: false,
    config: null,
    selectedIndex: 0,
    inputValue: '',
    error: null,
    resolve: null,
  })

  const showPromptInternal = useCallback((config: PromptConfig): Promise<string> => {
    return new Promise((resolve) => {
      setState({
        active: true,
        config,
        selectedIndex: 0,
        inputValue: config.defaultValue || '',
        error: null,
        resolve,
      })
    })
  }, [])

  // Set global function
  useEffect(() => {
    globalShowPrompt = showPromptInternal
    return () => {
      globalShowPrompt = null
    }
  }, [showPromptInternal])

  const handleSelect = useCallback((value: string) => {
    if (state.resolve) {
      state.resolve(value)
    }
    setState({
      active: false,
      config: null,
      selectedIndex: 0,
      inputValue: '',
      error: null,
      resolve: null,
    })
  }, [state.resolve])

  const setInputValue = useCallback((value: string) => {
    setState(prev => ({ ...prev, inputValue: value, error: null }))
  }, [])

  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error }))
  }, [])

  const setSelectedIndex = useCallback((index: number) => {
    setState(prev => ({ ...prev, selectedIndex: index }))
  }, [])

  return {
    isActive: state.active,
    config: state.config,
    selectedIndex: state.selectedIndex,
    inputValue: state.inputValue,
    error: state.error,
    setSelectedIndex,
    setInputValue,
    setError,
    handleSelect,
  }
}

// Prompt UI Component - render this inline in your layout
interface PromptUIProps {
  config: PromptConfig
  selectedIndex: number
  inputValue: string
  error: string | null
  setSelectedIndex: (index: number) => void
  setInputValue: (value: string) => void
  setError: (error: string | null) => void
  onSelect: (value: string) => void
}

export const PromptUI: React.FC<PromptUIProps> = ({ 
  config, 
  selectedIndex, 
  inputValue, 
  error,
  setSelectedIndex, 
  setInputValue,
  setError,
  onSelect 
}) => {
  const options = config.options || (config.type === 'confirm' ? CONFIRM_OPTIONS : [])
  
  // For select prompts, ensure we have options
  if (config.type === 'select' && (!config.options || config.options.length === 0)) {
    return (
      <Box>
        <Text color="red">Select prompt requires options</Text>
      </Box>
    )
  }

  // For text prompts
  if (config.type === 'text') {
    useInput((input, key) => {
      if (key.return) {
        // Validate if needed
        if (config.validate) {
          const validationResult = config.validate(inputValue)
          if (validationResult === true) {
            onSelect(inputValue)
          } else {
            setError(typeof validationResult === 'string' ? validationResult : 'Invalid input')
          }
        } else {
          onSelect(inputValue)
        }
      } else if (key.backspace || key.delete) {
        setInputValue(inputValue.slice(0, -1))
      } else if (input && !key.ctrl && !key.meta) {
        // Accept any input (including pasted multi-character strings)
        setInputValue(inputValue + input)
      }
    })

    const messageLines = config.message.trim().split('\n').filter(line => line.trim())
    
    return (
      <Box flexDirection="column" marginY={1}>
        {/* Message */}
        <Box flexDirection="column" marginBottom={1}>
          {messageLines.map((line, i) => (
            <Text color="white">
              {line}
            </Text>
          ))}
        </Box>

        {/* Input field */}
        <Box>
          <Text color="cyan">❯ </Text>
          <Text color="white">{inputValue}</Text>
          <Text color="gray">_</Text>
        </Box>

        {/* Error message */}
        {error && (
          <Box marginTop={1}>
            <Text color="red">{error}</Text>
          </Box>
        )}

        {/* Hint */}
        <Box marginTop={1}>
          <Text dimColor>
            (Type your answer and press Enter)
          </Text>
        </Box>
      </Box>
    )
  }

  useInput((input, key) => {
    if (key.upArrow || input === 'k') {
      setSelectedIndex(Math.max(0, selectedIndex - 1))
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex(Math.min(options.length - 1, selectedIndex + 1))
    } else if (key.return || input === ' ') {
      onSelect(options[selectedIndex].value)
    } else if (input === 'y' || input === 'Y') {
      const yesIdx = options.findIndex(o => o.value === 'yes')
      if (yesIdx >= 0) onSelect('yes')
    } else if (input === 'n' || input === 'N') {
      const noIdx = options.findIndex(o => o.value === 'no')
      if (noIdx >= 0) onSelect('no')
    }
  })

  // Split message into lines and render each
  const messageLines = config.message.trim().split('\n').filter(line => line.trim())

  // Clack-inspired design: minimal, clean, vertical layout
  return (
    <Box flexDirection="column" marginY={1}>
      {/* Message */}
      <Box flexDirection="column" marginBottom={1}>
        {messageLines.map((line, i) => (
          <Text  color="white">
            {line}
          </Text>
        ))}
      </Box>

      {/* Options - vertical list like clack */}
      <Box flexDirection="column" gap={0}>
        {options.map((opt, i) => (
          <Text >
            <Text color={i === selectedIndex ? 'cyan' : 'gray'}>
              {i === selectedIndex ? '❯ ' : '  '}
            </Text>
            <Text 
              color={i === selectedIndex ? 'cyan' : 'white'}
              bold={i === selectedIndex}
            >
              {opt.label}
            </Text>
          </Text>
        ))}
      </Box>

      {/* Hint text */}
      <Box marginTop={1}>
        <Text dimColor>
          {config.type === 'confirm' 
            ? '(Use ↑↓ arrows, y/n, or space/enter to select)' 
            : '(Use ↑↓ arrows and space/enter to select)'}
        </Text>
      </Box>
    </Box>
  )
}

// Legacy Provider for backward compatibility (optional, can be removed)
export const PromptProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <>{children}</>
}

export default PromptProvider
