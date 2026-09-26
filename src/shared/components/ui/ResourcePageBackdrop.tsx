type ResourcePageBackdropProps = {
  variant: "visas" | "market";
};

export default function ResourcePageBackdrop({
  variant,
}: ResourcePageBackdropProps) {
  if (variant === "visas") {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <svg
          className="absolute -right-44 top-24 h-[42rem] w-[42rem] text-cyan-300/25 motion-safe:animate-[spin_42s_linear_infinite] motion-reduce:animate-none"
          viewBox="0 0 640 640"
          fill="none"
        >
          <circle cx="320" cy="320" r="194" stroke="currentColor" />
          <circle
            cx="320"
            cy="320"
            r="252"
            stroke="currentColor"
            strokeDasharray="4 18"
          />
          <path
            d="M96 372C190 202 352 164 532 278"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <circle cx="125" cy="333" r="7" fill="currentColor" />
          <circle cx="524" cy="284" r="7" fill="currentColor" />
        </svg>
        <svg
          className="absolute -left-28 top-[46rem] h-[28rem] w-[28rem] text-violet-300/20 motion-safe:animate-[pulse_9s_ease-in-out_infinite] motion-reduce:animate-none"
          viewBox="0 0 420 420"
          fill="none"
        >
          <path
            d="M30 326C94 178 212 88 386 64"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M62 358C148 224 244 158 372 128"
            stroke="currentColor"
            strokeDasharray="3 13"
          />
          {Array.from({ length: 7 }, (_, index) => (
            <circle
              key={index}
              cx={62 + index * 48}
              cy={326 - index * 36}
              r="4"
              fill="currentColor"
            />
          ))}
        </svg>
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <svg
        className="absolute -right-40 top-20 h-[40rem] w-[40rem] text-violet-300/20 motion-safe:animate-[spin_48s_linear_infinite] motion-reduce:animate-none"
        viewBox="0 0 600 600"
        fill="none"
      >
        <circle
          cx="300"
          cy="300"
          r="228"
          stroke="currentColor"
          strokeDasharray="3 16"
        />
        <path
          d="M72 360C162 316 218 188 302 232C386 276 438 148 540 102"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M72 426C172 376 214 304 310 330C404 356 472 270 548 238"
          stroke="currentColor"
        />
        <circle cx="302" cy="232" r="6" fill="currentColor" />
        <circle cx="438" cy="148" r="6" fill="currentColor" />
      </svg>
      <svg
        className="absolute -left-24 top-[58rem] h-80 w-80 text-cyan-300/20 motion-safe:animate-[pulse_10s_ease-in-out_infinite] motion-reduce:animate-none"
        viewBox="0 0 320 320"
        fill="none"
      >
        {Array.from({ length: 5 }, (_, row) =>
          Array.from({ length: 5 }, (_, column) => (
            <circle
              key={`${row}-${column}`}
              cx={44 + column * 54}
              cy={44 + row * 54}
              r={2 + ((row + column) % 3)}
              fill="currentColor"
            />
          )),
        )}
        <path
          d="M38 252L92 198L146 218L200 126L254 154L290 72"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
}
