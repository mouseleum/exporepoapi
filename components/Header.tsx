export function Header() {
  return (
    <header>
      <div className="logo">
        <div className="logo-mark">
          <svg
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient
                id="mg"
                x1="4"
                y1="4"
                x2="28"
                y2="28"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor="#38b6ff" />
                <stop offset="100%" stopColor="#5b7fff" />
              </linearGradient>
            </defs>
            <path
              d="M5 26 L5 6 L9 6 L16 17 L23 6 L27 6 L27 26 L23 26 L23 13 L17 22 L15 22 L9 13 L9 26 Z"
              fill="url(#mg)"
            />
          </svg>
        </div>
        <div>
          <div className="logo-name">
            <span style={{ fontWeight: 600 }}>M</span>ikael&apos;s
          </div>
          <div className="logo-tag">Exhibitor Tools</div>
        </div>
      </div>
    </header>
  );
}
