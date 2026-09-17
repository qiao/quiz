import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { COLOR, MONO } from "../theme";
import { Caption } from "./Caption";

/** One source file that the skill reads, or skips. */
type SourceFile = { path: string; lines: number; skipped?: string };

const FILES: SourceFile[] = [
  { path: "src/auth/session.ts", lines: 128 },
  { path: "src/auth/tokens.ts", lines: 94 },
  { path: "src/auth/refresh.ts", lines: 76 },
  { path: "src/auth/logout.ts", lines: 41 },
  { path: "src/auth/middleware.ts", lines: 112 },
  { path: "src/auth/csrf.ts", lines: 58 },
  { path: "src/auth/providers/github.ts", lines: 87 },
  { path: "src/auth/providers/google.ts", lines: 91 },
  { path: "src/auth/providers/index.ts", lines: 23 },
  { path: "src/api/login.ts", lines: 64 },
  { path: "src/api/callback.ts", lines: 79 },
  { path: "src/api/logout.ts", lines: 31 },
  { path: "src/db/users.ts", lines: 143 },
  { path: "src/db/sessions.ts", lines: 118 },
  { path: "src/db/migrations/004_sessions.sql", lines: 36 },
  { path: "package-lock.json", lines: 9120, skipped: "lock file" },
  { path: "src/lib/crypto.ts", lines: 52 },
  { path: "src/lib/cookies.ts", lines: 67 },
  { path: "src/lib/rate-limit.ts", lines: 84 },
  { path: "src/config/auth.ts", lines: 45 },
  { path: "dist/server.js", lines: 20411, skipped: "build output" },
  { path: "docs/auth.md", lines: 210 },
  { path: "docs/sessions.md", lines: 164 },
  { path: "test/session.test.ts", lines: 188 },
  { path: "test/refresh.test.ts", lines: 142 },
  { path: "test/csrf.test.ts", lines: 96 },
  { path: "vendor/jwt/index.js", lines: 3302, skipped: "vendored code" },
  { path: "README.md", lines: 120 },
  { path: "src/auth/errors.ts", lines: 39 },
  { path: "src/auth/types.ts", lines: 72 },
  { path: "src/api/me.ts", lines: 28 },
  { path: "src/db/tokens.ts", lines: 101 },
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
