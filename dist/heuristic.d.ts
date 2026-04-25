export type HeuristicScore = {
    tokenEfficiency: number;
    structuralQuality: number;
    tokens: number;
    format: "toon" | "hybrid" | "markdown" | "other";
    warnings: string[];
};
export declare function score(body: string): HeuristicScore;
export declare function formatAnnotation(s: HeuristicScore): string;
//# sourceMappingURL=heuristic.d.ts.map