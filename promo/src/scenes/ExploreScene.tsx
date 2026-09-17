import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { COLOR, MONO } from "../theme";
import { Caption } from "./Caption";

/** One source file that the skill reads, or skips. */
type SourceFile = { path: string; lines: number; skipped?: string };

const FILES: SourceFile[] = [
  { path: "src/main.tsx", lines: 18 },
  { path: "src/App.tsx", lines: 142 },
  { path: "src/components/TodoList.tsx", lines: 96 },
  { path: "src/components/TodoItem.tsx", lines: 64 },
  { path: "src/components/Header.tsx", lines: 41 },
  { path: "src/components/Modal.tsx", lines: 88 },
  { path: "src/components/ErrorBoundary.tsx", lines: 57 },
  { path: "src/hooks/useFetch.ts", lines: 72 },
  { path: "src/hooks/useDebounce.ts", lines: 29 },
  { path: "src/hooks/useLocalStorage.ts", lines: 51 },
  { path: "src/hooks/useMediaQuery.ts", lines: 33 },
  { path: "src/context/ThemeContext.tsx", lines: 58 },
  { path: "src/context/AuthContext.tsx", lines: 104 },
  { path: "src/pages/Home.tsx", lines: 77 },
  { path: "src/pages/Settings.tsx", lines: 121 },
  { path: "package-lock.json", lines: 9120, skipped: "lock file" },
  { path: "src/pages/Profile.tsx", lines: 93 },
  { path: "src/reducers/todos.ts", lines: 69 },
  { path: "src/lib/api.ts", lines: 84 },
  { path: "src/lib/format.ts", lines: 46 },
  { path: "dist/assets/index.js", lines: 20411, skipped: "build output" },
  { path: "docs/state.md", lines: 150 },
  { path: "test/TodoList.test.tsx", lines: 132 },
  { path: "test/useFetch.test.ts", lines: 88 },
  { path: "node_modules/react/index.js", lines: 7, skipped: "dependency" },
  { path: "README.md", lines: 120 },
  { path: "src/hooks/useUndoReducer.ts", lines: 94 },
  { path: "src/styles/theme.ts", lines: 40 },
  { path: "src/types.ts", lines: 36 },
  { path: "vite.config.ts", lines: 22 },
];

/** Height of one file row in pixels. */
const ROW = 56;

/** Scene 2: the skill reads the source files and skips the files that do not teach. */
export const ExploreScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill name="Explore scene" style={{ backgroundColor: COLOR.background }}>
      <AbsoluteFill
        name="File list mask"
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent 0%, black 18%, black 52%, transparent 72%)",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 220,
            right: 220,
            top: 120,
            fontFamily: MONO,
            fontSize: 34,
            translate: interpolate(frame, [0, 80], ["0px 0px", `0px ${-ROW * 16}px`], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.45, 0, 0.55, 1),
            }),
          }}
        >
          {FILES.map((file, index) => (
            <div
              key={file.path}
              style={{
                height: ROW,
                display: "flex",
                alignItems: "center",
                gap: 32,
                color: file.skipped ? COLOR.faint : COLOR.text,
              }}
            >
              <span style={{ width: 56, textAlign: "right", color: COLOR.faint }}>
                {index + 1}
              </span>
              <span
                style={{ flex: 1, textDecoration: file.skipped ? "line-through" : undefined }}
              >
                {file.path}
              </span>
              {file.skipped ? (
                <span style={{ color: COLOR.faint }}>skip · {file.skipped}</span>
              ) : (
                <span style={{ color: COLOR.dim }}>
                  {file.lines} lines <span style={{ color: COLOR.green }}>✓</span>
                </span>
              )}
            </div>
          ))}
        </div>
      </AbsoluteFill>
      <Caption text="Read any code, doc, or URL" from={8} />
    </AbsoluteFill>
  );
};
