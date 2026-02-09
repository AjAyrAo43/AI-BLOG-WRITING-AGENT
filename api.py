"""
FastAPI wrapper for the Blog Writing Agent LangGraph backend.
Provides REST API endpoints for the HTML/CSS frontend.
"""

from __future__ import annotations

import json
import os
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel

# Import the LangGraph app
from bwa_backend import app as graph_app

# Create FastAPI app
api = FastAPI(title="Blog Writing Agent API", version="1.0.0")

# CORS for frontend development
api.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files (frontend)
frontend_dir = Path(__file__).parent / "frontend"
if frontend_dir.exists():
    api.mount("/static", StaticFiles(directory=str(frontend_dir)), name="static")


# ============================================================
# Request/Response Models
# ============================================================

class GenerateRequest(BaseModel):
    topic: str
    as_of: Optional[str] = None  # ISO date string


class TaskInfo(BaseModel):
    id: int
    title: str
    goal: str
    target_words: int
    requires_research: bool
    requires_citations: bool
    requires_code: bool
    tags: List[str]
    bullets: List[str]


class PlanInfo(BaseModel):
    blog_title: str
    audience: str
    tone: str
    blog_kind: str
    constraints: List[str]
    tasks: List[TaskInfo]


class EvidenceInfo(BaseModel):
    title: str
    url: str
    published_at: Optional[str]
    snippet: Optional[str]
    source: Optional[str]


class GenerateResponse(BaseModel):
    success: bool
    plan: Optional[PlanInfo]
    evidence: List[EvidenceInfo]
    final_markdown: str
    image_specs: List[dict]
    mode: str
    error: Optional[str] = None


class BlogSummary(BaseModel):
    filename: str
    title: str
    modified_at: str


# ============================================================
# API Endpoints
# ============================================================

@api.get("/", response_class=HTMLResponse)
async def serve_frontend():
    """Serve the main HTML page."""
    index_path = frontend_dir / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return HTMLResponse("<h1>Frontend not found. Please create frontend/index.html</h1>")


@api.post("/api/generate", response_model=GenerateResponse)
async def generate_blog(request: GenerateRequest):
    """Generate a blog post using the LangGraph backend."""
    try:
        as_of_date = request.as_of or date.today().isoformat()

        inputs: Dict[str, Any] = {
            "topic": request.topic.strip(),
            "mode": "",
            "needs_research": False,
            "queries": [],
            "evidence": [],
            "plan": None,
            "as_of": as_of_date,
            "recency_days": 7,
            "sections": [],
            "merged_md": "",
            "md_with_placeholders": "",
            "image_specs": [],
            "final": "",
        }

        # Run the graph
        result = graph_app.invoke(inputs)

        # Extract plan
        plan_obj = result.get("plan")
        plan_info = None
        if plan_obj:
            if hasattr(plan_obj, "model_dump"):
                plan_dict = plan_obj.model_dump()
            else:
                plan_dict = plan_obj

            tasks = [
                TaskInfo(
                    id=t.get("id", 0),
                    title=t.get("title", ""),
                    goal=t.get("goal", ""),
                    target_words=t.get("target_words", 0),
                    requires_research=t.get("requires_research", False),
                    requires_citations=t.get("requires_citations", False),
                    requires_code=t.get("requires_code", False),
                    tags=t.get("tags", []),
                    bullets=t.get("bullets", []),
                )
                for t in plan_dict.get("tasks", [])
            ]

            plan_info = PlanInfo(
                blog_title=plan_dict.get("blog_title", ""),
                audience=plan_dict.get("audience", ""),
                tone=plan_dict.get("tone", ""),
                blog_kind=plan_dict.get("blog_kind", ""),
                constraints=plan_dict.get("constraints", []),
                tasks=tasks,
            )

        # Extract evidence
        evidence_list = []
        for e in result.get("evidence", []):
            if hasattr(e, "model_dump"):
                e = e.model_dump()
            evidence_list.append(EvidenceInfo(
                title=e.get("title", ""),
                url=e.get("url", ""),
                published_at=e.get("published_at"),
                snippet=e.get("snippet"),
                source=e.get("source"),
            ))

        # Save the markdown file
        final_md = result.get("final", "") or result.get("merged_md", "")
        if plan_info and final_md:
            slug = plan_info.blog_title.lower().replace(" ", "_")[:50]
            slug = "".join(c for c in slug if c.isalnum() or c == "_")
            filename = f"{slug or 'blog'}.md"
            Path(filename).write_text(final_md, encoding="utf-8")

        return GenerateResponse(
            success=True,
            plan=plan_info,
            evidence=evidence_list,
            final_markdown=final_md,
            image_specs=result.get("image_specs", []),
            mode=result.get("mode", ""),
        )

    except Exception as e:
        return GenerateResponse(
            success=False,
            plan=None,
            evidence=[],
            final_markdown="",
            image_specs=[],
            mode="",
            error=str(e),
        )


@api.get("/api/blogs", response_model=List[BlogSummary])
async def list_blogs():
    """List all saved blog markdown files."""
    cwd = Path(".")
    blogs = []

    for p in cwd.glob("*.md"):
        if p.name in ("README.md", "task.md", "implementation_plan.md"):
            continue
        if not p.is_file():
            continue

        try:
            content = p.read_text(encoding="utf-8", errors="replace")
            # Extract title from first # heading
            title = p.stem
            for line in content.splitlines():
                if line.startswith("# "):
                    title = line[2:].strip()
                    break

            blogs.append(BlogSummary(
                filename=p.name,
                title=title,
                modified_at=str(p.stat().st_mtime),
            ))
        except Exception:
            pass

    # Sort by modified time, newest first
    blogs.sort(key=lambda x: float(x.modified_at), reverse=True)
    return blogs


@api.get("/api/blogs/{filename}")
async def get_blog(filename: str):
    """Get a specific blog's content."""
    # Security: only allow .md files in current directory
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    if not filename.endswith(".md"):
        raise HTTPException(status_code=400, detail="Only .md files allowed")

    path = Path(filename)
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Blog not found")

    content = path.read_text(encoding="utf-8", errors="replace")
    return {"filename": filename, "content": content}


# ============================================================
# Run server
# ============================================================

if __name__ == "__main__":
    import uvicorn
    print("Starting Blog Writing Agent API server...")
    print("Frontend: http://localhost:8000")
    print("API docs: http://localhost:8000/docs")
    uvicorn.run(api, host="127.0.0.1", port=8000)
