import { useEffect, useState } from "react";
import SetupConfigPages from "./SetupConfigPages.jsx";
import "./App.css";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://10.100.124.84:5053";
const RESOURCE_TYPES = ["Person", "Machine", "Shared", "Other"];

function api(path) {
  return `${API_BASE.replace(/\/$/, "")}/${path}`;
}

function minuteText(value) {
  if (value == null || value === "") return "";
  const minute = Number(value);
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function minuteValue(value) {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function emptyResource(orgCode, displayOrder) {
  return {
    resourceID: null,
    orgCode,
    resourceCode: "",
    resourceName: "",
    resourceType: "Person",
    efficiencyModifierPercent: 100,
    shiftStartOverrideMinute: null,
    shiftEndOverrideMinute: null,
    displayOrder,
    isActive: true,
    departmentIDs: [],
  };
}

async function request(path, options) {
  const response = await fetch(api(path), {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => null);
    throw new Error(
      problem?.error ||
        problem?.detail ||
        `Request failed (${response.status})`,
    );
  }
  return response.json();
}

function App() {
  const [orgCode, setOrgCode] = useState("FMH");
  const [data, setData] = useState({
    orgs: [],
    masterDepartments: [],
    departments: [],
    resources: [],
    resourceDepartments: [],
    interruptions: [],
  });
  const [activePage, setActivePage] = useState("resources");
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editor, setEditor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadSetup(code = orgCode) {
    setLoading(true);
    setError("");
    try {
      const result = await request(
        `api/setup?orgCode=${encodeURIComponent(code)}`,
      );
      setData({
        orgs: result.orgs || [],
        masterDepartments: result.masterDepartments || [],
        departments: result.departments || [],
        resources: result.resources || [],
        resourceDepartments: result.resourceDepartments || [],
        interruptions: result.interruptions || [],
      });
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSetup("FMH");
  }, []);

  const departments = data.departments
    .filter((department) => department.isActive)
    .sort(
      (a, b) =>
        a.departmentName.localeCompare(b.departmentName) ||
        a.departmentCode.localeCompare(b.departmentCode),
    );
  const departmentFilterOptions = [...data.departments].sort(
    (a, b) =>
      a.departmentName.localeCompare(b.departmentName) ||
      a.departmentCode.localeCompare(b.departmentCode),
  );

  const visibleResources = data.resources
    .filter((resource) => showInactive || resource.isActive)
    .filter(
      (resource) =>
        !departmentFilter ||
        data.resourceDepartments.some(
          (assignment) =>
            assignment.resourceID === resource.resourceID &&
            assignment.departmentID === departmentFilter &&
            assignment.isActive,
        ),
    )
    .filter((resource) => {
      const needle = search.trim().toLowerCase();
      return (
        !needle ||
        `${resource.resourceName} ${resource.resourceCode} ${resource.resourceType}`
          .toLowerCase()
          .includes(needle)
      );
    })
    .sort(
      (a, b) =>
        a.displayOrder - b.displayOrder ||
        a.resourceName.localeCompare(b.resourceName),
    );
  const nextResourceOrder =
    data.resources.reduce(
      (highest, resource) =>
        Math.max(highest, Number(resource.displayOrder) || 0),
      0,
    ) + 10;

  function assignedDepartments(resourceID) {
    const assignmentIDs = new Set(
      data.resourceDepartments
        .filter(
          (assignment) =>
            assignment.resourceID === resourceID && assignment.isActive,
        )
        .map((assignment) => assignment.departmentID),
    );
    return data.departments.filter((department) =>
      assignmentIDs.has(department.departmentID),
    );
  }

  function openNew() {
    setNotice("");
    setEditor(emptyResource(orgCode, nextResourceOrder));
  }

  function openEdit(resource) {
    setNotice("");
    setEditor({
      ...resource,
      departmentIDs: assignedDepartments(resource.resourceID).map(
        (department) => department.departmentID,
      ),
    });
  }

  function updateEditor(name, value) {
    setEditor((current) => ({ ...current, [name]: value }));
  }

  function toggleDepartment(departmentID) {
    setEditor((current) => {
      const selected = new Set(current.departmentIDs);
      if (selected.has(departmentID)) selected.delete(departmentID);
      else selected.add(departmentID);
      return { ...current, departmentIDs: [...selected] };
    });
  }

  async function saveResource(event) {
    event.preventDefault();
    const saveAndNext = event.nativeEvent.submitter?.value === "saveNext";
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = await request("api/setup/resource", {
        method: "PUT",
        body: JSON.stringify({
          resourceID: editor.resourceID,
          orgCode,
          resourceCode: editor.resourceCode,
          resourceName: editor.resourceName,
          resourceType: editor.resourceType,
          efficiencyModifierPercent: Number(editor.efficiencyModifierPercent),
          shiftStartOverrideMinute: minuteValue(editor.shiftStartTime),
          shiftEndOverrideMinute: minuteValue(editor.shiftEndTime),
          displayOrder: Number(editor.displayOrder || 0),
          isActive: editor.isActive,
        }),
      });
      await request("api/setup/resourceassignments", {
        method: "PUT",
        body: JSON.stringify({
          resourceID: saved.resourceID,
          orgCode,
          departmentIDs: editor.departmentIDs,
        }),
      });
      if (saveAndNext && saved.action === "created") {
        setEditor((current) => ({
          ...current,
          resourceID: null,
          resourceCode: "",
          resourceName: "",
          displayOrder: Number(current.displayOrder || 0) + 10,
          isActive: true,
          isFollowup: true,
        }));
        setNotice(
          "Resource added. The template settings are ready for the next one.",
        );
      } else {
        setEditor(null);
        setNotice(
          saved.action === "created" ? "Resource added." : "Resource saved.",
        );
      }
      await loadSetup();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(resource) {
    const activeOrg = data.orgs.find((org) => org.orgCode === orgCode);
    setEditor({
      ...resource,
      shiftStartTime: minuteText(resource.shiftStartOverrideMinute),
      shiftEndTime: minuteText(resource.shiftEndOverrideMinute),
      departmentIDs: assignedDepartments(resource.resourceID).map(
        (department) => department.departmentID,
      ),
      orgName: activeOrg?.orgName || orgCode,
    });
  }

  function startCopy(resource) {
    setError("");
    setNotice("");
    setEditor({
      ...resource,
      resourceID: null,
      resourceCode: "",
      resourceName: "",
      displayOrder: nextResourceOrder,
      isActive: true,
      departmentIDs: assignedDepartments(resource.resourceID).map(
        (department) => department.departmentID,
      ),
    });
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#resources"
          onClick={() => setActivePage("resources")}
          aria-label="FMH Dispatch Setup home"
        >
          <span className="brand-mark">F</span>
          <span>
            <strong>FMH</strong>
            <small>DISPATCH SETUP</small>
          </span>
        </a>
        <div className="nav-label">CONFIGURATION</div>
        <nav aria-label="Setup sections">
          <button
            className={`nav-item ${activePage === "resources" ? "selected" : ""}`}
            onClick={() => setActivePage("resources")}
            type="button"
          >
            <span className="nav-symbol">R</span>Resources
          </button>
          <button
            className={`nav-item ${activePage === "departments" ? "selected" : ""}`}
            onClick={() => setActivePage("departments")}
            type="button"
          >
            <span className="nav-symbol">D</span>Departments
          </button>
          <button
            className={`nav-item ${activePage === "masterDepartments" ? "selected" : ""}`}
            onClick={() => setActivePage("masterDepartments")}
            type="button"
          >
            <span className="nav-symbol">M</span>Master Departments
          </button>
          <button
            className={`nav-item ${activePage === "organizations" ? "selected" : ""}`}
            onClick={() => setActivePage("organizations")}
            type="button"
          >
            <span className="nav-symbol">O</span>Organizations
          </button>
        </nav>
        <div className="sidebar-foot">
          <span className="connection-dot" />
          Setup workspace
        </div>
      </aside>

      <main className="main" id="resources">
        <header className="topbar">
          <div className="crumb">
            Configuration <span>/</span>{" "}
            {
              {
                resources: "Resources",
                departments: "Departments",
                masterDepartments: "Master Departments",
                organizations: "Organizations",
              }[activePage]
            }
          </div>
          <label className="org-select">
            <span>Organization</span>
            <select
              value={orgCode}
              onChange={(event) => {
                const next = event.target.value;
                setOrgCode(next);
                setDepartmentFilter("");
                loadSetup(next);
              }}
            >
              {(data.orgs.length
                ? data.orgs
                : [{ orgCode: "FMH", orgName: "FMH" }]
              ).map((org) => (
                <option key={org.orgCode} value={org.orgCode}>
                  {org.orgCode}
                </option>
              ))}
            </select>
          </label>
        </header>

        <section className="content" hidden={activePage !== "resources"}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">SHOP FLOOR CONFIGURATION</div>
              <h1>Resources</h1>
              <p>People and equipment available for dispatch.</p>
            </div>
            <button className="primary-button" onClick={openNew} type="button">
              <span>+</span> Add resource
            </button>
          </div>

          <div className="summary-strip">
            <div>
              <span className="summary-value">
                {data.resources.filter((resource) => resource.isActive).length}
              </span>
              <span className="summary-label">Active resources</span>
            </div>
            <div>
              <span className="summary-value">{departments.length}</span>
              <span className="summary-label">Active departments</span>
            </div>
            <div className="summary-org">
              <span className="summary-label">Current organization</span>
              <strong>
                {data.orgs.find((org) => org.orgCode === orgCode)?.orgName ||
                  orgCode}
              </strong>
            </div>
          </div>

          {error && (
            <div className="alert error-alert" role="alert">
              <span>!</span>
              {error}
              <button
                type="button"
                onClick={() => setError("")}
                aria-label="Dismiss error"
              >
                x
              </button>
            </div>
          )}
          {notice && (
            <div className="alert success-alert" role="status">
              {notice}
              <button
                type="button"
                onClick={() => setNotice("")}
                aria-label="Dismiss notice"
              >
                x
              </button>
            </div>
          )}

          <div className="toolbar">
            <label className="search-box">
              <span aria-hidden="true">S</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find a resource"
              />
            </label>
            <label className="department-filter">
              <span>Department</span>
              <select
                value={departmentFilter}
                onChange={(event) => setDepartmentFilter(event.target.value)}
              >
                <option value="">All departments</option>
                {departmentFilterOptions.map((department) => (
                  <option
                    key={department.departmentID}
                    value={department.departmentID}
                  >
                    {department.departmentName}
                    {department.departmentCode !== department.departmentName
                      ? ` (${department.departmentCode})`
                      : ""}
                    {!department.isActive ? " (inactive)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="check-filter">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(event) => setShowInactive(event.target.checked)}
              />{" "}
              Show inactive
            </label>
            <span className="row-count">{visibleResources.length} records</span>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>RESOURCE</th>
                  <th>TYPE</th>
                  <th>ORDER</th>
                  <th>EFFICIENCY</th>
                  <th>SHIFT OVERRIDE</th>
                  <th>ASSIGNED DEPARTMENTS</th>
                  <th>STATUS</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="8" className="empty-state">
                      Loading setup data...
                    </td>
                  </tr>
                ) : visibleResources.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="empty-state">
                      No resources match this view.
                    </td>
                  </tr>
                ) : (
                  visibleResources.map((resource) => {
                    const assignments = assignedDepartments(
                      resource.resourceID,
                    );
                    const shift =
                      resource.shiftStartOverrideMinute == null &&
                      resource.shiftEndOverrideMinute == null
                        ? "Department shift"
                        : `${minuteText(resource.shiftStartOverrideMinute) || "-"} to ${minuteText(resource.shiftEndOverrideMinute) || "-"}`;
                    return (
                      <tr key={resource.resourceID}>
                        <td>
                          <button
                            className="resource-name"
                            type="button"
                            onClick={() => startEdit(resource)}
                          >
                            {resource.resourceName}
                          </button>
                          <span className="resource-code">
                            {resource.resourceCode}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`type-label ${resource.resourceType?.toLowerCase()}`}
                          >
                            {resource.resourceType}
                          </span>
                        </td>
                        <td>{resource.displayOrder}</td>
                        <td>
                          <span className="efficiency-number">
                            {Number(
                              resource.efficiencyModifierPercent,
                            ).toLocaleString()}
                            %
                          </span>
                          {Number(resource.efficiencyModifierPercent) ===
                            100 && (
                            <span className="neutral-note">standard</span>
                          )}
                        </td>
                        <td className="shift-value">{shift}</td>
                        <td>
                          <div className="department-tags">
                            {assignments.length ? (
                              assignments.map((department) => (
                                <span
                                  className="department-tag"
                                  key={department.departmentID}
                                >
                                  {department.departmentName}
                                </span>
                              ))
                            ) : (
                              <span className="unassigned">Unassigned</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span
                            className={`status ${resource.isActive ? "active" : "inactive"}`}
                          >
                            <i />
                            {resource.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="edit-button"
                              type="button"
                              onClick={() => startEdit(resource)}
                              aria-label={`Edit ${resource.resourceName}`}
                            >
                              Edit
                            </button>
                            <button
                              className="edit-button"
                              type="button"
                              onClick={() => startCopy(resource)}
                              aria-label={`Copy ${resource.resourceName} as a template`}
                            >
                              Copy
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <footer className="table-footer">
            <span>Dispatch resources</span>
            <span>Changes save to the Fabric configuration</span>
          </footer>
        </section>
        {activePage !== "resources" && (
          <section className="content">
            <SetupConfigPages
              page={activePage}
              orgCode={orgCode}
              data={data}
              loadSetup={loadSetup}
              setError={setError}
              setNotice={setNotice}
            />
          </section>
        )}
      </main>

      {editor && (
        <div
          className="drawer-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditor(null);
          }}
        >
          <aside
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="editor-title"
          >
            <form onSubmit={saveResource}>
              <header className="drawer-header">
                <div>
                  <span className="eyebrow">
                    {editor.resourceID ? "RESOURCE RECORD" : "NEW RECORD"}
                  </span>
                  <h2 id="editor-title">
                    {editor.resourceID
                      ? "Edit resource"
                      : editor.isFollowup
                        ? "Add next resource"
                        : "Add resource"}
                  </h2>
                </div>
                <button
                  className="close-button"
                  type="button"
                  onClick={() => setEditor(null)}
                  aria-label="Close editor"
                >
                  x
                </button>
              </header>
              <div className="drawer-content">
                {editor.isFollowup && (
                  <div className="copy-next-notice" role="status">
                    The previous resource was added. Enter the next code and
                    name; copied settings are retained.
                  </div>
                )}
                <div className="form-grid">
                  <label className="field span-two">
                    <span>
                      Resource name <b>*</b>
                    </span>
                    <input
                      required
                      maxLength="200"
                      autoFocus
                      value={editor.resourceName}
                      onChange={(event) =>
                        updateEditor("resourceName", event.target.value)
                      }
                      placeholder="e.g. CNC Operator 04"
                    />
                  </label>
                  <label className="field">
                    <span>
                      Resource code <b>*</b>
                    </span>
                    <input
                      required
                      maxLength="50"
                      value={editor.resourceCode}
                      onChange={(event) =>
                        updateEditor("resourceCode", event.target.value)
                      }
                      placeholder="e.g. CNC-04"
                    />
                  </label>
                  <label className="field">
                    <span>Resource type</span>
                    <select
                      value={editor.resourceType}
                      onChange={(event) =>
                        updateEditor("resourceType", event.target.value)
                      }
                    >
                      {RESOURCE_TYPES.map((type) => (
                        <option key={type}>{type}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Display order</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={editor.displayOrder ?? 0}
                      onChange={(event) =>
                        updateEditor("displayOrder", event.target.value)
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Efficiency modifier</span>
                    <div className="input-suffix">
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={editor.efficiencyModifierPercent}
                        onChange={(event) =>
                          updateEditor(
                            "efficiencyModifierPercent",
                            event.target.value,
                          )
                        }
                      />
                      <span>%</span>
                    </div>
                    <small>
                      100% uses the department efficiency unchanged.
                    </small>
                  </label>
                  <div className="field-group span-two">
                    <span className="group-title">
                      Shift override{" "}
                      <small>Leave blank to use department hours.</small>
                    </span>
                    <div className="shift-inputs">
                      <label className="field">
                        <span>Start</span>
                        <input
                          type="time"
                          value={editor.shiftStartTime || ""}
                          onChange={(event) =>
                            updateEditor("shiftStartTime", event.target.value)
                          }
                        />
                      </label>
                      <label className="field">
                        <span>End</span>
                        <input
                          type="time"
                          value={editor.shiftEndTime || ""}
                          onChange={(event) =>
                            updateEditor("shiftEndTime", event.target.value)
                          }
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <section className="assignment-section">
                  <div className="assignment-heading">
                    <div>
                      <h3>Department assignments</h3>
                      <p>{editor.departmentIDs.length} selected</p>
                    </div>
                    <span className="assignment-icon">A</span>
                  </div>
                  {departments.length ? (
                    <div className="department-options">
                      {departments.map((department) => (
                        <label
                          className="department-option"
                          key={department.departmentID}
                        >
                          <input
                            type="checkbox"
                            checked={editor.departmentIDs.includes(
                              department.departmentID,
                            )}
                            onChange={() =>
                              toggleDepartment(department.departmentID)
                            }
                          />
                          <span className="department-check" />
                          <span className="option-copy">
                            <strong>{department.departmentName}</strong>
                            <small>{department.departmentCode}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="no-departments">
                      No active departments are available.
                    </p>
                  )}
                </section>

                <label className="active-toggle">
                  <span>
                    <strong>Active resource</strong>
                    <small>
                      Inactive resources remain in setup but are hidden from
                      dispatch.
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    checked={editor.isActive}
                    onChange={(event) =>
                      updateEditor("isActive", event.target.checked)
                    }
                  />
                  <i />
                </label>
              </div>
              <footer className="drawer-footer">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setEditor(null)}
                >
                  Cancel
                </button>
                {!editor.resourceID && (
                  <button
                    className="secondary-button"
                    type="submit"
                    name="saveMode"
                    value="saveNext"
                    disabled={saving}
                  >
                    Save + next
                  </button>
                )}
                <button
                  className="primary-button"
                  type="submit"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save resource"}
                </button>
              </footer>
            </form>
          </aside>
        </div>
      )}
    </div>
  );
}

export default App;
