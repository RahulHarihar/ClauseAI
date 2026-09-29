import { runContractPipeline } from "./services/contractPipeline";

const corsHeaders = {
	"Access-Control-Allow-Origin": process.env.FRONTEND_URL || "*",
	"Access-Control-Allow-Methods": "POST, GET, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
	"Content-Type": "application/json",
};

Bun.serve({
	port: process.env.PORT || 3000,
	routes: {
		"/api/negotiate": {
			OPTIONS: () =>
				new Response(null, {
					status: 204,
					headers: corsHeaders,
				}),

			POST: async (req) => {
				try {
					const formData = await req.formData();

					const contractA = formData.get("contractA") as File | null;
					const contractB = formData.get("contractB") as File | null;

					if (!contractA || !contractB) {
						return new Response(
							JSON.stringify({ error: "Both contracts are required" }),
							{ status: 400, headers: corsHeaders },
						);
					}

					// P2: enforce file size limit (10 MB per file)
					const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
					if (contractA.size > MAX_FILE_SIZE) {
						return new Response(
							JSON.stringify({ error: "Party A contract exceeds the 10 MB file size limit." }),
							{ status: 400, headers: corsHeaders },
						);
					}
					if (contractB.size > MAX_FILE_SIZE) {
						return new Response(
							JSON.stringify({ error: "Party B contract exceeds the 10 MB file size limit." }),
							{ status: 400, headers: corsHeaders },
						);
					}

					// Convert files to buffers
					const bufferA = Buffer.from(await contractA.arrayBuffer());
					const bufferB = Buffer.from(await contractB.arrayBuffer());

					let result: Awaited<ReturnType<typeof runContractPipeline>>;
					try {
						result = await runContractPipeline(bufferA, bufferB, {
							mode: "retrieval",
						});
					} catch (pipelineError) {
						const message =
							pipelineError instanceof Error
								? pipelineError.message
								: String(pipelineError);
						if (message.includes("Could not extract clauses")) {
							return new Response(
								JSON.stringify({
									error:
										"Could not extract text from one or both contracts. The PDF may be scanned or image-based.",
								}),
								{ status: 400, headers: corsHeaders },
							);
						}
						throw pipelineError;
					}

					const { clausesA: _a, clausesB: _b, modelUsed: _m, ...payload } =
						result;

					return new Response(JSON.stringify(payload), {
						headers: corsHeaders,
					});
				} catch (error) {
					console.error("Negotiation error:", error);
					return new Response(
						JSON.stringify({ error: "Failed to analyze contracts" }),
						{ status: 500, headers: corsHeaders },
					);
				}
			},
		},

		"/api/health": {
			OPTIONS: () =>
				new Response(null, {
					status: 204,
					headers: corsHeaders,
				}),

			GET: () =>
				new Response(JSON.stringify({ status: "ok" }), {
					headers: corsHeaders,
				}),
		},
	},

	development: {
		hmr: true,
		console: true,
	},
});

console.log(`ClauseAI API running on http://localhost:${process.env.PORT || 3000}`);
