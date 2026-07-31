// Fixed chat layout - messages won't spill behind input
import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { useScreenSize, withFullScreen } from 'fullscreen-ink';
import TextInput from "ink-text-input";
import fs from "fs/promises";
import path from "path";
import {
  interceptInput,
  isCliInvocation,
  getRegisteredCommands,
  filterCommands,
  executeCommand,
} from "../utils/commandRegistry.js";
import {
  confirm,
  text,
  select,
  usePromptState,
  PromptUI,
} from "../utils/prompt.js";
import { OptionsPane } from "../components/OptionsPane";
import { FileBrowser } from "../utils/fileBrowser";
import { MessageBubble } from "../components/MessageBubble";
import { ASCIIHeader } from "../utils/ascii.js";
import { licenseState } from "../utils/licenseStatus";
import { NetworkStatus } from "../utils/networkStatus";
import { ThinkingAnimation } from "../utils/thinking";
import { invokeCli } from "../utils/cliInvoke.js";
import { Assistant } from "../ttc/api";
import { initCommands } from "../ttc/cmd.js";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

// Exports for external access
export var current: Assistant | null = null;
export let clearChat: (() => void) | null = null;
export let pushSystemMessage: ((content: string) => void) | null = null;
// export var currentApi: gneolAssistantAPI | null = null;
// export var currentAgent: AgentCredentials | null = null;

export const setCurrent = (assistant) => {
  current = assistant;
};

interface ChatAppProps {
  assistant: Assistant;
}

const ChatApp: React.FC<ChatAppProps> = ({ assistant }) => {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const { height: terminalHeight, width: terminalWidth } = useScreenSize();

  // Core state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [inputKey, setInputKey] = useState(0); // Forces TextInput remount to reset cursor
  const [isThinking, setIsThinking] = useState(false);
  const [llmState, setLlmState] = useState<string>("");
  const [llmSubState, setLlmSubState] = useState<string>("");
  const [networkMessage, setNetworkMessage] = useState<string>("");
  const [socketMessage, setSocketMessage] = useState<string>("");
  const [networkStatus, setNetworkStatus] = useState<string>("");

  // Sci-fi messages for socket events
  const connectionMessages = [
    "Neural link synced",
    "Bot matrix pulsating",
    "Cybernet signal stable",
    "Quantum core activated",
  ];
  // const disconnectionMessages = ["Assistant is offline"];

  // UI state
  const [showOptionsPane, setShowOptionsPane] = useState(false);
  const [optionsType, setOptionsType] = useState<"commands" | "files">(
    "commands",
  );
  const [optionsList, setOptionsList] = useState<string[]>([]);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);
  const [optionsFilter, setOptionsFilter] = useState<string>("");
  const fileBrowserRef = useRef<FileBrowser>(new FileBrowser());

  // Prompt state
  const promptState = usePromptState();

  // Calculate available height for messages
  // Header: ~9 lines, Input: ~3 lines, Thinking: ~2 lines, Prompt: ~4 lines, padding: ~2 lines
  const HEADER_HEIGHT = 9;
  const INPUT_HEIGHT = 3;
  const THINKING_HEIGHT = isThinking ? 2 : 0;
  const PROMPT_HEIGHT = promptState.isActive ? 5 : 0;
  const OPTIONS_HEIGHT = showOptionsPane
    ? Math.min(optionsList.length + 2, 8)
    : 0;
  const PADDING = 2;

  const availableMessageHeight = Math.max(
    3,
    terminalHeight -
      HEADER_HEIGHT -
      INPUT_HEIGHT -
      THINKING_HEIGHT -
      PROMPT_HEIGHT -
      OPTIONS_HEIGHT -
      PADDING,
  );

  // Estimate how many lines a message occupies
  const estimateMessageLines = useCallback(
    (msg: Message): number => {
      const content = msg.content || "";
      const wrappedLines = content.split("\n").reduce((acc, line) => {
        return acc + Math.max(1, Math.ceil(line.length / (terminalWidth - 4)));
      }, 0);
      return Math.max(1, wrappedLines) + 1; // +1 for role label
    },
    [terminalWidth],
  );

  // Total lines in all messages
  const totalMessageLines = useMemo(() => {
    return messages.reduce((sum, m) => sum + estimateMessageLines(m), 0);
  }, [messages, estimateMessageLines]);
  const maxScroll = Math.max(0, totalMessageLines - availableMessageHeight);

  // Scroll state — 0 = top, maxScroll = bottom
  const [scrollOffset, setScrollOffset] = useState(maxScroll);
  const atBottom = scrollOffset >= maxScroll;
  const atBottomRef = useRef(atBottom);
  atBottomRef.current = atBottom;
  const scrollPercent =
    maxScroll > 0 ? Math.round((scrollOffset / maxScroll) * 100) : 100;
  const showScrollBar = maxScroll > 0;

  // Track message count for auto-scroll
  const prevCountRef = useRef(messages.length);
  const scrollToBottomOnNextTick = useRef(false);
  useEffect(() => {
    if (
      messages.length > prevCountRef.current &&
      scrollToBottomOnNextTick.current
    ) {
      setScrollOffset(maxScrollRef.current);
      scrollToBottomOnNextTick.current = false;
    } else if (messages.length < prevCountRef.current) {
      setScrollOffset(0);
    }
    prevCountRef.current = messages.length;
  }, [messages.length]);

  // Slice content to show a block of visual lines starting from skipTop
  const sliceMessage = useCallback(
    (msg: Message, maxLines: number, skipTop: number): Message => {
      const content = msg.content || "";
      if (maxLines <= 0) return { ...msg, content: "" };
      if (skipTop <= 0 && maxLines >= estimateMessageLines(msg)) return msg;

      const rawLines = content.split("\n");
      const charsPerLine = terminalWidth - 4;
      const lineHeights = rawLines.map((l) =>
        Math.max(1, Math.ceil(l.length / Math.max(1, charsPerLine))),
      );

      // Find which actual line contains skipTop
      let skipRemaining = skipTop;
      let startIdx = 0;
      for (; startIdx < rawLines.length; startIdx++) {
        const h = lineHeights[startIdx];
        if (skipRemaining < h) break;
        skipRemaining -= h;
      }

      if (startIdx >= rawLines.length) return { ...msg, content: "" };

      const outLines: string[] = [];
      let taken = 0;

      for (let i = startIdx; i < rawLines.length && taken < maxLines; i++) {
        const h = lineHeights[i];
        let line = rawLines[i];

        // Partial skip at the start of this line
        if (i === startIdx && skipRemaining > 0) {
          const charSkip = Math.min(skipRemaining * charsPerLine, line.length);
          line = "…" + line.slice(charSkip);
        }

        const wrapped = Math.max(1, Math.ceil(line.length / charsPerLine));

        if (taken + wrapped <= maxLines) {
          outLines.push(line);
          taken += wrapped;
        } else {
          // Partial line at the end
          const remainingChars = (maxLines - taken) * charsPerLine - 1;
          if (remainingChars > 0) {
            outLines.push(line.slice(0, Math.max(0, remainingChars)) + "…");
          }
          taken = maxLines;
          break;
        }
      }

      return { ...msg, content: outLines.join("\n") };
    },
    [terminalWidth, estimateMessageLines],
  );

  // Compute visible messages by scanning oldest-to-newest
  const visibleMessages = useMemo((): Message[] => {
    if (messages.length === 0 || availableMessageHeight <= 0) return [];

    const viewStart = scrollOffset;
    const viewEnd = scrollOffset + availableMessageHeight;
    const result: Message[] = [];
    let runningOffset = 0;

    for (let i = 0; i < messages.length; i++) {
      const mh = estimateMessageLines(messages[i]);
      const msgStart = runningOffset;
      const msgEnd = runningOffset + mh;
      runningOffset = msgEnd;

      if (msgEnd <= viewStart) continue; // entirely above
      if (msgStart >= viewEnd) break; // past viewport

      const overlapStart = Math.max(msgStart, viewStart);
      const overlapEnd = Math.min(msgEnd, viewEnd);
      const overlapLines = overlapEnd - overlapStart;

      if (overlapLines <= 0) continue;

      const skipTop = overlapStart - msgStart;
      const sliced = sliceMessage(messages[i], overlapLines, skipTop);
      result.push(sliced);
    }

    return result;
  }, [
    messages,
    scrollOffset,
    availableMessageHeight,
    estimateMessageLines,
    sliceMessage,
  ]);

  // Scroll handlers — use refs to avoid stale closures
  const scrollOffsetRef = useRef(scrollOffset);
  scrollOffsetRef.current = scrollOffset;
  const maxScrollRef = useRef(maxScroll);
  maxScrollRef.current = maxScroll;

  const scrollUp = useCallback(() => {
    const step = Math.max(1, Math.floor(availableMessageHeight / 3));
    setScrollOffset((prev) => Math.max(0, prev - step));
  }, [availableMessageHeight]);

  const scrollDown = useCallback(() => {
    if (scrollOffsetRef.current >= maxScrollRef.current) return;
    const step = Math.max(1, Math.floor(availableMessageHeight / 3));
    setScrollOffset((prev) => Math.min(maxScrollRef.current, prev + step));
  }, [availableMessageHeight]);

  const jumpToBottom = useCallback(
    () => setScrollOffset(maxScrollRef.current),
    [],
  );

  // File browser utilities
  const updateFileList = async (filter?: string) => {
    if (!filter) {
      // No filter: show nothing (or maybe a placeholder)
      setOptionsList([]);
      return;
    }
    // Use global file search
    const { searchFiles } = await import("../utils/fileSearch" as any);
    const files = await searchFiles(filter);
    setOptionsList(files);
  };

  const handleOptionSelect = async () => {
    const selected = optionsList[selectedOptionIndex];
    if (!selected) return;

    if (optionsType === "commands") {
      setShowOptionsPane(false);
      setOptionsFilter("");
      setInput("");
      executeCommand(selected, []);
    } else {
      // File selected from global search
      const relativePath = selected; // already relative
      // Append path to input
      setInputKey(Date.now());
      setInput((prev) => {
        const newText = prev.replace(/@[^\s]*$/, "") + "@" + relativePath + " ";
        return newText;
      });
      setShowOptionsPane(false);
      setOptionsFilter("");
    }
  };

  // Input handlers
  useInput((inputChar, key) => {
    if (inputChar === "c" && key.ctrl) {
      console.log("\n\nGoodbye! 👋\n");
      exit();
    }

    // Scroll keys (when not in options pane)
    if (!showOptionsPane) {
      if (key.upArrow && input === "") {
        scrollUp();
        return;
      }
      if (key.downArrow && input === "") {
        scrollDown();
        return;
      }
      if (inputChar === " " && input === "") {
        if (!atBottom) {
          jumpToBottom();
          return;
        }
      }
    }

    if (showOptionsPane) {
      if (key.upArrow) {
        setSelectedOptionIndex((prev) =>
          prev > 0 ? prev - 1 : optionsList.length - 1,
        );
      } else if (key.downArrow) {
        setSelectedOptionIndex((prev) =>
          prev < optionsList.length - 1 ? prev + 1 : 0,
        );
      } else if (key.return) {
        handleOptionSelect();
      } else if (key.escape) {
        setShowOptionsPane(false);
        setOptionsFilter("");
        setInput("");
      } else if (key.backspace || key.delete) {
        if (optionsFilter.length > 0) {
          const newFilter = optionsFilter.slice(0, -1);
          setOptionsFilter(newFilter);
          setSelectedOptionIndex(0);
          if (optionsType === "commands") {
            setOptionsList(filterCommands(newFilter));
          } else {
            updateFileList(newFilter);
          }
        } else {
          setShowOptionsPane(false);
          setInput("");
        }
      } else if (inputChar && !key.ctrl && !key.meta) {
        // Accept any input (including pasted multi-character strings)
        const newFilter = optionsFilter + inputChar;
        setOptionsFilter(newFilter);
        setSelectedOptionIndex(0);
        if (optionsType === "commands") {
          setOptionsList(filterCommands(newFilter));
        } else {
          updateFileList(newFilter);
        }
      }
    }
  });

  const handleInputChange = (value: string) => {
    setInput(value);

    if (!showOptionsPane) {
      if (value.endsWith("/") && (value === "/" || value.endsWith(" /"))) {
        setShowOptionsPane(true);
        setOptionsType("commands");
        setOptionsList(getRegisteredCommands());
        setOptionsFilter("");
        setSelectedOptionIndex(0);
      } else if (
        value.endsWith("@") &&
        (value === "@" || value.endsWith(" @"))
      ) {
        setShowOptionsPane(true);
        setOptionsType("files");
        updateFileList();
        setOptionsFilter("");
        setSelectedOptionIndex(0);
      }
    }
  };

  const handleSubmit = async (value: string) => {
    if (showOptionsPane) return;

    if (!value.trim()) return;

    // CLI invocation
    if (isCliInvocation(value)) {
      setInput("");
      const parts = value.trim().slice(1).split(/\s+/);
      const cmd = parts[0];
      const args = parts.slice(1);

      try {
        const res = await invokeCli([cmd, ...args].join(" "));
        scrollToBottomOnNextTick.current = true;
        if (res.timedOut) {
          setMessages((prev) => [
            ...prev,
            { role: "system", content: `Command timed out` },
          ]);
        }
        if (res.stdout?.trim()) {
          setMessages((prev) => [
            ...prev,
            { role: "system", content: res.stdout.trim() },
          ]);
        }
        if (res.stderr?.trim()) {
          setMessages((prev) => [
            ...prev,
            { role: "system", content: `ERR: ${res.stderr.trim()}` },
          ]);
        }
      } catch (err: any) {
        setMessages((prev) => [
          ...prev,
          { role: "system", content: `Error: ${String(err)}` },
        ]);
      }
      return;
    }

    // Slash commands
    if (interceptInput(value)) {
      setInput("");
      return;
    }

    // Regular message
    scrollToBottomOnNextTick.current = true;
    setMessages((prev) => [...prev, { role: "user", content: value + "\n" }]);
    setIsThinking(true);
    assistant.message(value + "\n");
    setInput("");
  };

  // Setup effects
  useEffect(() => {
    clearChat = () => {
      setMessages([]);
    };
    pushSystemMessage = (c: string) => {
      scrollToBottomOnNextTick.current = true;
      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        const prefix = lastMsg?.role === "system" ? " ├──" : " └──";
        return [...prev, { role: "system", content: `   ${prefix} ${c}` }];
      });
    };

    // Subscribe to events
    assistant.subscribe("llm", (data) => {
      const { state, sub_state, type } = data.payload;
      if (type === "state") {
        setLlmState(state);
      } else if (type === "sub_state") {
        setLlmSubState(state || "");
      }
      if (state?.toLowerCase() === "idle") {
        setIsThinking(false);
      }
    });

    assistant.subscribe("permission", async (data) => {
      const { question, pId } = data.payload;
      const message = question;
      const allowed = await confirm(message);
      if (allowed) {
        assistant.approveFunction(pId, true);
      } else {
        const reason = await text(
          "Reason for rejection (press Enter to skip):",
        );
        // assistant.approveFunction(data.id, false);
        // if (reason.trim()) {
        assistant.approveFunction(
          pId,
          false,
          `[Permission Denied] Reason: ${reason.trim()}`,
        );
        // }
      }
    });

    assistant.subscribe("form", async (data) => {
      try {
        const { id, question, options } = data.payload;
        const selected = await select(question, options);
        assistant.submitFormSelection(id, [selected]);
      } catch (error) {
        pushSystemMessage(`Unknow error ${error.message}`);
      }
    });

    assistant.subscribe("message", (msg: any) => {
      scrollToBottomOnNextTick.current = true;
      // fs.writeFile('./debug.json', JSON.stringify(msg))
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: msg.payload + "\n" },
      ]);
    });

    assistant.subscribe("user-message", (msg: any) => {
      scrollToBottomOnNextTick.current = true;
      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (
          lastMsg?.role === "user" &&
          lastMsg.content.trim() === (msg + "").trim()
        ) {
          return prev;
        }
        return [...prev, { role: "user", content: msg + "\n" }];
      });
    });

    assistant.subscribe("action_log", (log: any) => {
      scrollToBottomOnNextTick.current = true;
      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        const prefix = lastMsg?.role === "system" ? "  ─ " : " └──";
        return [
          ...prev,
          { role: "system", content: `${prefix} ${log.payload}` },
        ];
      });
    });

    assistant.subscribe("network", (data) => {
      const { message, status, type } = data.payload;
      // Update network status display based on type
      if (type === "socket") {
        let msg = message || "";
        if (status === "connected" && type === "socket") {
          msg =
            connectionMessages[
              Math.floor(Math.random() * connectionMessages.length)
            ];
        } else if (status === "disconnected") {
          msg = `${assistant.name} is offline`;
        }
        setSocketMessage(msg);
        // Only socket events control the connection status
        if (status) {
          setNetworkStatus(status);
        }
      } else if (type === "api") {
        setNetworkMessage(message || "");
      }
    });

    // Load initial data
    const loadInitialData = async () => {
      try {
        await assistant.stats();
        const history = await assistant.history(20, 1);
        // pushSystemMessage(JSON.stringify(history))
        fs.writeFile('./debug.json', JSON.stringify(history, null, 2))
        const editedHistory =
          history?.data?.map((msg) => ({
            role: msg.role as Message["role"],
            content:
              msg.role === "assistant" ? msg.content + "\n" : msg.content,
          })) || [];
        scrollToBottomOnNextTick.current = true;
        setMessages(editedHistory);
      } catch (err: any) {
        fs.writeFile('./debug.json', JSON.stringify({
          error: err.message
        }, null, 2))
        pushSystemMessage(err.message);
      }
    };
    loadInitialData();

    // console.log = pushSystemMessage || console.log;

    // (ttc as any).ai.processFunctionCall(assistant.id, [
    //   {
    //     function: 'Cli.execute',
    //     arguments: {
    //       command: 'pwd',
    //       timeout: 10
    //     }
    //   }
    // ])

    // pushSystemMessage(assistant.name + ' ' + assistant.model)
    return () => {
      clearChat = null;
      pushSystemMessage = null;
    };
  }, []);

  return (
    <Box flexDirection="column">
      {/* HEADER */}
      <Box flexShrink={0}>
        <ASCIIHeader assistantName={assistant.name} model={assistant.llm} />
      </Box>

      {/* SCROLL INDICATOR — shows only when scrolled up and content exists */}
      {!atBottom && showScrollBar && (
        <Box flexShrink={0} paddingLeft={2}>
          <Text color="cyan">Scrolled — {scrollPercent}%</Text>
        </Box>
      )}

      {/* MESSAGES */}
      <Box flexDirection="column" flexShrink={0}>
        {visibleMessages.map((msg, i) => (
          <MessageBubble key={i} role={msg.role} content={msg.content} />
        ))}
      </Box>

      {/* THINKING */}
      {
        <Box flexShrink={0}>
          <ThinkingAnimation
            state={llmState}
            subState={llmSubState}
            isThinking={isThinking}
          />
        </Box>
      }

      {/* INPUT - follows messages */}
      <Box
        flexShrink={0}
        flexDirection="row"
        borderStyle="single"
        borderColor="grey"
        borderTop
        borderBottom
        borderLeft={false}
        borderRight={false}
      >
        <Box width={2}>
          <Text color="white">❯</Text>
        </Box>
        <Box flexGrow={1}>
          {!promptState.isActive ? (
            <TextInput
              // @ts-expect-error key prop triggers remount for cursor reset
              key={inputKey}
              value={input}
              onChange={handleInputChange}
              onSubmit={handleSubmit}
              placeholder="Type your message... (/ for commands, @ for files)"
            />
          ) : (
            <Text color="gray">Prompt active - use prompt controls</Text>
          )}
        </Box>
      </Box>

      {/* NETWORK STATUS */}
      <Box flexShrink={0}>
        <NetworkStatus
          socketMessage={socketMessage}
          apiMessage={networkMessage}
          status={networkStatus}
        />
      </Box>

      {/* OPTIONS PANE */}
      {showOptionsPane && (
        <Box flexShrink={0}>
          <OptionsPane
            options={optionsList}
            selectedIndex={selectedOptionIndex}
            type={optionsType}
            filter={optionsFilter}
          />
        </Box>
      )}

      {/* PROMPT */}
      {promptState.isActive && promptState.config && (
        <Box flexShrink={0}>
          <PromptUI
            config={promptState.config}
            selectedIndex={promptState.selectedIndex}
            inputValue={promptState.inputValue}
            error={promptState.error}
            setSelectedIndex={promptState.setSelectedIndex}
            setInputValue={promptState.setInputValue}
            setError={promptState.setError}
            onSelect={promptState.handleSelect}
          />
        </Box>
      )}

      {/* Empty space fills the rest */}
      <Box flexGrow={1} />
    </Box>
  );
};

export async function startChat(agent: string, name: string, path: string) {

  // console.log(agent, path, name)
  try {
    const current = new Assistant(agent, path);
    
    await current.stats(name);
    await current.init();
    // console.log(current)
    setCurrent(current);

    await initCommands();
  
    const app = withFullScreen(
      <ChatApp assistant={current} />,
    );
    await app.start();
    await app.waitUntilExit();
  } catch (error) {
    console.log(error.message)
  }
}
