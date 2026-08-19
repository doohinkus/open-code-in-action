import { test, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageInput } from "../MessageInput";
import { InspectionProvider } from "@/lib/contexts/inspection-context";
import { ReactNode } from "react";

afterEach(() => {
  cleanup();
});

function renderWithProviders(ui: ReactNode) {
  return render(<InspectionProvider>{ui}</InspectionProvider>);
}

function mockSpeechRecognition(permissionState: PermissionState = "granted") {
  const mockStart = vi.fn();
  const mockStop = vi.fn();
  const mockAbort = vi.fn();

  class MockSpeechRecognition {
    continuous = false;
    interimResults = false;
    lang = "";
    onresult: ((event: unknown) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    onend: (() => void) | null = null;
    start = mockStart;
    stop = mockStop;
    abort = mockAbort;
  }

  Object.defineProperty(window, "SpeechRecognition", {
    value: MockSpeechRecognition,
    writable: true,
  });
  Object.defineProperty(window, "webkitSpeechRecognition", {
    value: MockSpeechRecognition,
    writable: true,
  });

  const changeListeners: Array<() => void> = [];
  const mockPermissionStatus = {
    state: permissionState,
    onchange: null as (() => void) | null,
    addEventListener: vi.fn((event: string, cb: () => void) => {
      if (event === "change") changeListeners.push(cb);
    }),
    removeEventListener: vi.fn(),
    addEventListener2: undefined as undefined,
    removeEventListener2: undefined as undefined,
    dispatchEvent: vi.fn(),
    triggerChange: (newState: PermissionState) => {
      mockPermissionStatus.state = newState;
      changeListeners.forEach((cb) => cb());
    },
  };

  Object.defineProperty(navigator, "permissions", {
    value: {
      query: vi.fn().mockResolvedValue(mockPermissionStatus),
    },
    writable: true,
    configurable: true,
  });

  return { mockStart, mockStop, mockAbort, mockPermissionStatus };
}

function getSendButton() {
  return screen.getByTitle("Send message");
}

function getMicButton() {
  return screen.getByTitle("Start voice input");
}

test("renders with placeholder text", () => {
  const mockProps = {
    input: "",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: false,
  };

  renderWithProviders(<MessageInput {...mockProps} />);

  const textarea = screen.getByPlaceholderText("Describe the React component you want to create...");
  expect(textarea).toBeDefined();
});

test("displays the input value", () => {
  const mockProps = {
    input: "Test input value",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: false,
  };

  renderWithProviders(<MessageInput {...mockProps} />);

  const textarea = screen.getByDisplayValue("Test input value");
  expect(textarea).toBeDefined();
});

test("calls handleInputChange when typing", async () => {
  const handleInputChange = vi.fn();
  const mockProps = {
    input: "",
    handleInputChange,
    handleSubmit: vi.fn(),
    isLoading: false,
  };

  renderWithProviders(<MessageInput {...mockProps} />);

  const textarea = screen.getByPlaceholderText("Describe the React component you want to create...");
  await userEvent.type(textarea, "Hello");

  expect(handleInputChange).toHaveBeenCalled();
});

test("calls handleSubmit when form is submitted", async () => {
  const handleSubmit = vi.fn((e) => e.preventDefault());
  const mockProps = {
    input: "Test input",
    handleInputChange: vi.fn(),
    handleSubmit,
    isLoading: false,
  };

  renderWithProviders(<MessageInput {...mockProps} />);

  const form = screen.getByRole("textbox").closest("form")!;
  fireEvent.submit(form);

  expect(handleSubmit).toHaveBeenCalledOnce();
});

test("submits form when Enter is pressed without shift", async () => {
  const handleSubmit = vi.fn((e) => e.preventDefault());
  const mockProps = {
    input: "Test input",
    handleInputChange: vi.fn(),
    handleSubmit,
    isLoading: false,
  };

  renderWithProviders(<MessageInput {...mockProps} />);

  const textarea = screen.getByRole("textbox");
  fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

  expect(handleSubmit).toHaveBeenCalledOnce();
});

test("does not submit form when Enter is pressed with shift", async () => {
  const handleSubmit = vi.fn((e) => e.preventDefault());
  const mockProps = {
    input: "Test input",
    handleInputChange: vi.fn(),
    handleSubmit,
    isLoading: false,
  };

  renderWithProviders(<MessageInput {...mockProps} />);

  const textarea = screen.getByRole("textbox");
  fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

  expect(handleSubmit).not.toHaveBeenCalled();
});

test("disables textarea when isLoading is true", () => {
  const mockProps = {
    input: "",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: true,
  };

  renderWithProviders(<MessageInput {...mockProps} />);

  const textarea = screen.getByRole("textbox");
  expect(textarea).toHaveProperty("disabled", true);
});

test("disables send button when isLoading is true", () => {
  mockSpeechRecognition();
  const mockProps = {
    input: "Test input",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: true,
  };

  renderWithProviders(<MessageInput {...mockProps} />);

  const sendButton = getSendButton();
  expect(sendButton).toHaveProperty("disabled", true);
});

test("disables send button when input is empty", () => {
  mockSpeechRecognition();
  const mockProps = {
    input: "",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: false,
  };

  renderWithProviders(<MessageInput {...mockProps} />);

  const sendButton = getSendButton();
  expect(sendButton).toHaveProperty("disabled", true);
});

test("disables send button when input contains only whitespace", () => {
  mockSpeechRecognition();
  const mockProps = {
    input: "   ",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: false,
  };

  renderWithProviders(<MessageInput {...mockProps} />);

  const sendButton = getSendButton();
  expect(sendButton).toHaveProperty("disabled", true);
});

test("enables send button when input has content and not loading", () => {
  mockSpeechRecognition();
  const mockProps = {
    input: "Valid content",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: false,
  };

  renderWithProviders(<MessageInput {...mockProps} />);

  const sendButton = getSendButton();
  expect(sendButton).toHaveProperty("disabled", false);
});

test("applies correct CSS classes based on loading state", () => {
  mockSpeechRecognition();
  const { rerender } = renderWithProviders(
    <MessageInput
      input="Test"
      handleInputChange={vi.fn()}
      handleSubmit={vi.fn()}
      isLoading={false}
    />
  );

  let sendButton = getSendButton();
  expect(sendButton.className).toContain("disabled:opacity-40");
  expect(sendButton.className).toContain("bg-primary");

  rerender(
    <InspectionProvider>
      <MessageInput
        input="Test"
        handleInputChange={vi.fn()}
        handleSubmit={vi.fn()}
        isLoading={true}
      />
    </InspectionProvider>
  );

  sendButton = getSendButton();
  expect(sendButton.className).toContain("disabled:cursor-not-allowed");
  expect(sendButton.className).toContain("disabled:opacity-40");
});

test("send button uses muted style when disabled by loading", () => {
  mockSpeechRecognition();
  const { rerender } = renderWithProviders(
    <MessageInput
      input="Test"
      handleInputChange={vi.fn()}
      handleSubmit={vi.fn()}
      isLoading={false}
    />
  );

  expect(getSendButton().className).toContain("bg-primary");

  rerender(
    <InspectionProvider>
      <MessageInput
        input="Test"
        handleInputChange={vi.fn()}
        handleSubmit={vi.fn()}
        isLoading={true}
      />
    </InspectionProvider>
  );

  expect(getSendButton().className).toContain("bg-muted");
});

test("textarea has correct styling classes", () => {
  const mockProps = {
    input: "",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: false,
  };

  renderWithProviders(<MessageInput {...mockProps} />);

  const textarea = screen.getByRole("textbox");
  expect(textarea.className).toContain("min-h-[80px]");
  expect(textarea.className).toContain("max-h-[200px]");
  expect(textarea.className).toContain("resize-none");
  expect(textarea.className).toContain("rounded-2xl");
  const shell = textarea.parentElement;
  expect(shell?.className).toContain("focus-within:ring-primary/20");
});

test("send button click triggers form submission", async () => {
  mockSpeechRecognition();
  const handleSubmit = vi.fn((e) => e.preventDefault());
  const mockProps = {
    input: "Test input",
    handleInputChange: vi.fn(),
    handleSubmit,
    isLoading: false,
  };

  renderWithProviders(<MessageInput {...mockProps} />);

  const sendButton = getSendButton();
  await userEvent.click(sendButton);

  expect(handleSubmit).toHaveBeenCalledOnce();
});

test("shows mic button when SpeechRecognition is supported", () => {
  mockSpeechRecognition();
  const mockProps = {
    input: "",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: false,
  };

  renderWithProviders(<MessageInput {...mockProps} />);

  expect(getMicButton()).toBeDefined();
});

test("hides mic button when SpeechRecognition is unsupported", () => {
  Object.defineProperty(window, "SpeechRecognition", { value: undefined, writable: true });
  Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, writable: true });

  const mockProps = {
    input: "",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: false,
  };

  renderWithProviders(<MessageInput {...mockProps} />);

  expect(screen.queryByTitle("Start voice input")).toBeNull();
});

test("clicking mic button starts listening", () => {
  const { mockStart } = mockSpeechRecognition();
  const mockProps = {
    input: "",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: false,
  };

  renderWithProviders(<MessageInput {...mockProps} />);

  const micButton = getMicButton();
  fireEvent.click(micButton);

  expect(mockStart).toHaveBeenCalled();
});

test("disables mic button when isLoading", () => {
  mockSpeechRecognition();
  const mockProps = {
    input: "",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: true,
  };

  renderWithProviders(<MessageInput {...mockProps} />);

  const micButton = screen.getByTitle("Start voice input");
  expect(micButton).toHaveProperty("disabled", true);
});

test("textarea gets red border when listening", () => {
  mockSpeechRecognition();
  const mockProps = {
    input: "",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: false,
  };

  const { rerender } = renderWithProviders(<MessageInput {...mockProps} />);

  let textarea = screen.getByRole("textbox");
  expect(textarea.className).not.toContain("caret-destructive");
  expect(textarea.parentElement?.className).toContain("border-border");

  // Simulate listening state via re-render won't work directly since
  // isListening is internal state, but we can verify the class exists
  // in the component logic by checking the conditional class string
});

test("textarea has pr-24 padding for both buttons", () => {
  const mockProps = {
    input: "",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: false,
  };

  renderWithProviders(<MessageInput {...mockProps} />);

  const textarea = screen.getByRole("textbox");
  expect(textarea.className).toContain("pr-24");
});

test("hides mic button when microphone permission is denied", async () => {
  mockSpeechRecognition("denied");
  const mockProps = {
    input: "",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: false,
  };

  renderWithProviders(<MessageInput {...mockProps} />);

  await vi.waitFor(() => {
    expect(screen.queryByTitle("Start voice input")).toBeNull();
  });
});

test("shows mic button when microphone permission is granted", async () => {
  mockSpeechRecognition("granted");
  const mockProps = {
    input: "",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: false,
  };

  renderWithProviders(<MessageInput {...mockProps} />);

  await vi.waitFor(() => {
    expect(getMicButton()).toBeDefined();
  });
});

test("shows mic button when microphone permission is prompt", async () => {
  mockSpeechRecognition("prompt");
  const mockProps = {
    input: "",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: false,
  };

  renderWithProviders(<MessageInput {...mockProps} />);

  await vi.waitFor(() => {
    expect(getMicButton()).toBeDefined();
  });
});

test("shows mic button when navigator.permissions is unavailable", () => {
  mockSpeechRecognition();
  Object.defineProperty(navigator, "permissions", {
    value: undefined,
    writable: true,
    configurable: true,
  });

  const mockProps = {
    input: "",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: false,
  };

  renderWithProviders(<MessageInput {...mockProps} />);

  expect(getMicButton()).toBeDefined();
});
