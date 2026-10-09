import { useState } from "react";

const API_BASE = "https://ca-irvfmh-as08.ametek.com/SchedulerAPI";

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

async function send(path, options) {
  const response = await fetch(`${API_BASE.replace(/\/$/, "")}/${path}`, {
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

const pageDetails = {
  departments: {
    title: "Departments",
    description: "Set department shifts, efficiency, and interruption windows.",
    action: "Add department",
  },
  masterDepartments: {
    title: "Master Departments",
    description: "Group departments for the selected organization.",
    action: "Add master department",
  },
  organizations: {
    title: "Organizations",
    description: "Manage organization codes and availability.",
    action: "Add organization",
  },
};

function statusLabel(active) {
  return (
    <span className={`status ${active ? "active" : "inactive"}`}>
      <i />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export default function SetupConfigPages({
  page,
  orgCode,
  data,
  loadSetup,
  setError,
  setNotice,
  setOrgCode,
}) {
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editor, setEditor] = useState(null);
  const [interruptionEditor, setInterruptionEditor] = useState(null);
  const [resourceToLink, setResourceToLink] = useState("");
  const [saving, setSaving] = useState(false);
  const detail = pageDetails[page];

  const orgs = data.orgs || [];
  const masters = (data.masterDepartments || []).filter(
    (item) => item.orgCode === orgCode,
  );
  const departments = (data.departments || []).filter(
    (item) => item.orgCode === orgCode,
  );
  const interruptions = data.interruptions || [];
  const departmentResourceAssignments = editor?.departmentID
    ? data.resourceDepartments.filter(
        (assignment) =>
          assignment.departmentID === editor.departmentID &&
          assignment.isActive,
      )
    : [];
  const linkedResourceIDs = new Set(
    departmentResourceAssignments.map((assignment) => assignment.resourceID),
  );
  const linkedResources = data.resources.filter((resource) =>
    linkedResourceIDs.has(resource.resourceID),
  );
  const linkableResources = data.resources
    .filter(
      (resource) =>
        resource.isActive && !linkedResourceIDs.has(resource.resourceID),
    )
    .sort(
      (a, b) =>
        Number(a.displayOrder || 0) - Number(b.displayOrder || 0) ||
        a.resourceName.localeCompare(b.resourceName),
    );
  const currentDepartments = departments
    .filter((item) => showInactive || item.isActive)
    .filter((item) =>
      matches(search, `${item.departmentName} ${item.departmentCode}`),
    )
    .sort(
      (a, b) =>
        Number(a.displayOrder || 0) - Number(b.displayOrder || 0) ||
        a.departmentCode.localeCompare(b.departmentCode),
    );
  const currentMasters = masters
    .filter((item) => showInactive || item.isActive)
    .filter((item) =>
      matches(
        search,
        `${item.masterDepartmentName} ${item.masterDepartmentCode}`,
      ),
    )
    .sort(
      (a, b) =>
        Number(a.displayOrder || 0) - Number(b.displayOrder || 0) ||
        a.masterDepartmentCode.localeCompare(b.masterDepartmentCode),
    );
  const currentOrgs = orgs
    .filter((item) => showInactive || item.isActive)
    .filter((item) => matches(search, `${item.orgName} ${item.orgCode}`));

  function matches(term, text) {
    const needle = term.trim().toLowerCase();
    return !needle || text.toLowerCase().includes(needle);
  }

  function newRecord(kind) {
    setError("");
    setNotice("");
    setResourceToLink("");
    const values = {
      organization: {
        orgID: null,
        orgCode: "",
        orgName: "",
        isActive: true,
        displayOrder: orgs.length,
      },
      masterDepartment: {
        masterDepartmentID: null,
        orgCode,
        masterDepartmentCode: "",
        masterDepartmentName: "",
        isActive: true,
        displayOrder: masters.length,
      },
      department: {
        departmentID: null,
        orgCode,
        masterDepartmentID: "",
        departmentCode: "",
        departmentName: "",
        efficiencyPercent: 100,
        shiftStartMinute: 360,
        shiftEndMinute: 870,
        shiftStartTime: "06:00",
        shiftEndTime: "14:30",
        isActive: true,
        displayOrder: departments.length,
      },
    };
    setEditor({ kind, ...values[kind] });
  }

  function editRecord(kind, record) {
    setError("");
    setNotice("");
    setResourceToLink("");
    setEditor({
      kind,
      ...record,
      ...(kind === "department"
        ? {
            shiftStartTime: minuteText(record.shiftStartMinute),
            shiftEndTime: minuteText(record.shiftEndMinute),
          }
        : {}),
    });
  }

  function copyDepartment(record) {
    setError("");
    setResourceToLink("");
    setNotice(
      "Department settings copied. Add interruptions after saving the new department.",
    );
    setEditor({
      kind: "department",
      ...record,
      departmentID: null,
      departmentCode: "",
      departmentName: "",
      displayOrder: departments.length,
      isActive: true,
      shiftStartTime: minuteText(record.shiftStartMinute),
      shiftEndTime: minuteText(record.shiftEndMinute),
    });
  }

  function setField(name, value) {
    setEditor((current) => ({ ...current, [name]: value }));
  }

  async function saveRecord(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      let path;
      let payload;
      if (editor.kind === "organization") {
        path = "api/setup/org";
        payload = {
          orgID: editor.orgID,
          orgCode: editor.orgCode,
          orgName: editor.orgName,
          isActive: editor.isActive,
          displayOrder: Number(editor.displayOrder || 0),
        };
      } else if (editor.kind === "masterDepartment") {
        path = "api/setup/masterdepartment";
        payload = {
          masterDepartmentID: editor.masterDepartmentID,
          orgCode,
          masterDepartmentCode: editor.masterDepartmentCode,
          masterDepartmentName: editor.masterDepartmentName,
          isActive: editor.isActive,
          displayOrder: Number(editor.displayOrder || 0),
        };
      } else {
        path = "api/setup/department";
        payload = {
          departmentID: editor.departmentID,
          orgCode,
          masterDepartmentID: editor.masterDepartmentID,
          departmentCode: editor.departmentCode,
          departmentName: editor.departmentName,
          efficiencyPercent: Number(editor.efficiencyPercent),
          shiftStartMinute: minuteValue(editor.shiftStartTime),
          shiftEndMinute: minuteValue(editor.shiftEndTime),
          isActive: editor.isActive,
          displayOrder: Number(editor.displayOrder || 0),
        };
      }

      const saved = await send(path, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (editor.kind === "department" && saved.action === "created") {
        setEditor((current) => ({
          ...current,
          departmentID: saved.departmentID,
        }));
        setNotice("Department added. You can now add its interruptions.");
      } else {
        setEditor(null);
        setNotice(`${detail.title.slice(0, -1)} saved.`);
      }
      await loadSetup(orgCode);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  function openInterruption(record = null) {
    if (!editor?.departmentID) {
      setError("Save the department before adding interruptions.");
      return;
    }
    setError("");
    setInterruptionEditor(
      record
        ? {
            ...record,
            startTime: minuteText(record.startMinute),
            endTime: minuteText(record.endMinute),
          }
        : {
            departmentInterruptionID: null,
            departmentID: editor.departmentID,
            interruptionType: "Break",
            interruptionName: "",
            startMinute: 540,
            endMinute: 555,
            startTime: "09:00",
            endTime: "09:15",
            displayOrder: interruptions.filter(
              (item) => item.departmentID === editor.departmentID,
            ).length,
            isActive: true,
          },
    );
  }

  async function saveInterruption(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await send("api/setup/interruption", {
        method: "PUT",
        body: JSON.stringify({
          departmentInterruptionID: interruptionEditor.departmentInterruptionID,
          orgCode,
          departmentID: editor.departmentID,
          interruptionType: interruptionEditor.interruptionType,
          interruptionName: interruptionEditor.interruptionName,
          startMinute: minuteValue(interruptionEditor.startTime),
          endMinute: minuteValue(interruptionEditor.endTime),
          displayOrder: Number(interruptionEditor.displayOrder || 0),
          isActive: interruptionEditor.isActive,
        }),
      });
      setInterruptionEditor(null);
      setNotice("Interruption saved.");
      await loadSetup();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function linkExistingResource() {
    const resource = data.resources.find(
      (item) => item.resourceID === resourceToLink,
    );
    if (!editor?.departmentID || !resource) return;

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const departmentIDs = new Set(
        data.resourceDepartments
          .filter(
            (assignment) =>
              assignment.resourceID === resource.resourceID &&
              assignment.isActive,
          )
          .map((assignment) => assignment.departmentID),
      );
      departmentIDs.add(editor.departmentID);

      await send("api/setup/resourceassignments", {
        method: "PUT",
        body: JSON.stringify({
          resourceID: resource.resourceID,
          orgCode,
          departmentIDs: [...departmentIDs],
        }),
      });

      setResourceToLink("");
      setNotice(`${resource.resourceName} linked to ${editor.departmentName}.`);
      await loadSetup(orgCode);
    } catch (linkError) {
      setError(linkError.message);
    } finally {
      setSaving(false);
    }
  }

  const rows =
    page === "organizations"
      ? currentOrgs
      : page === "masterDepartments"
        ? currentMasters
        : currentDepartments;
  const addKind =
    page === "organizations"
      ? "organization"
      : page === "masterDepartments"
        ? "masterDepartment"
        : "department";

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">SHOP FLOOR CONFIGURATION</div>
          <h1>{detail.title}</h1>
          <p>{detail.description}</p>
        </div>
        <button
          className="primary-button"
          onClick={() => newRecord(addKind)}
          type="button"
        >
          <span>+</span>
          {detail.action}
        </button>
      </div>

      {page === "departments" && (
        <div className="summary-strip compact-summary">
          <div>
            <span className="summary-value">
              {departments.filter((item) => item.isActive).length}
            </span>
            <span className="summary-label">Active departments</span>
          </div>
          <div>
            <span className="summary-value">
              {masters.filter((item) => item.isActive).length}
            </span>
            <span className="summary-label">Master departments</span>
          </div>
          <div className="summary-org">
            <span className="summary-label">Current organization</span>
            <strong>{orgCode}</strong>
          </div>
        </div>
      )}

      <div className="toolbar">
        <label className="search-box">
          <span aria-hidden="true">S</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Find ${detail.title.toLowerCase()}`}
          />
        </label>
        <label className="check-filter">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(event) => setShowInactive(event.target.checked)}
          />{" "}
          Show inactive
        </label>
        <span className="row-count">{rows.length} records</span>
      </div>

      <div className="table-wrap">
        {page === "organizations" && (
          <table>
            <thead>
              <tr>
                <th>ORGANIZATION</th>
                <th>CODE</th>
                <th>STATUS</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {currentOrgs.length ? (
                currentOrgs.map((org) => (
                  <tr key={org.orgID}>
                    <td>
                      <button
                        className="resource-name"
                        onClick={() => editRecord("organization", org)}
                        type="button"
                      >
                        {org.orgName}
                      </button>
                    </td>
                    <td>{org.orgCode}</td>
                    <td>{statusLabel(org.isActive)}</td>
                    <td>
                      <button
                        className="edit-button"
                        onClick={() => editRecord("organization", org)}
                        type="button"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="empty-state" colSpan="4">
                    No organizations match this view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {page === "masterDepartments" && (
          <table>
            <thead>
              <tr>
                <th>MASTER DEPARTMENT</th>
                <th>CODE</th>
                <th>DEPARTMENTS</th>
                <th>ORDER</th>
                <th>STATUS</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {currentMasters.length ? (
                currentMasters.map((master) => (
                  <tr key={master.masterDepartmentID}>
                    <td>
                      <button
                        className="resource-name"
                        onClick={() => editRecord("masterDepartment", master)}
                        type="button"
                      >
                        {master.masterDepartmentName}
                      </button>
                    </td>
                    <td>{master.masterDepartmentCode}</td>
                    <td>
                      {
                        departments.filter(
                          (department) =>
                            department.masterDepartmentID ===
                            master.masterDepartmentID,
                        ).length
                      }
                    </td>
                    <td>{master.displayOrder}</td>
                    <td>{statusLabel(master.isActive)}</td>
                    <td>
                      <button
                        className="edit-button"
                        onClick={() => editRecord("masterDepartment", master)}
                        type="button"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="empty-state" colSpan="6">
                    No master departments match this view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {page === "departments" && (
          <table>
            <thead>
              <tr>
                <th>DEPARTMENT</th>
                <th>ORDER</th>
                <th>MASTER DEPARTMENT</th>
                <th>EFFICIENCY</th>
                <th>SHIFT</th>
                <th>RESOURCES</th>
                <th>INTERRUPTIONS</th>
                <th>STATUS</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {currentDepartments.length ? (
                currentDepartments.map((department) => {
                  const master = masters.find(
                    (item) =>
                      item.masterDepartmentID === department.masterDepartmentID,
                  );
                  const resourceCount = data.resourceDepartments.filter(
                    (assignment) =>
                      assignment.departmentID === department.departmentID &&
                      assignment.isActive,
                  ).length;
                  const interruptionCount = interruptions.filter(
                    (item) =>
                      item.departmentID === department.departmentID &&
                      item.isActive,
                  ).length;
                  return (
                    <tr key={department.departmentID}>
                      <td>
                        <button
                          className="resource-name"
                          onClick={() => editRecord("department", department)}
                          type="button"
                        >
                          {department.departmentName}
                        </button>
                        <span className="resource-code">
                          {department.departmentCode}
                        </span>
                      </td>
                      <td>{department.displayOrder}</td>
                      <td>{master?.masterDepartmentName || "-"}</td>
                      <td>
                        <span className="efficiency-number">
                          {Number(
                            department.efficiencyPercent,
                          ).toLocaleString()}
                          %
                        </span>
                      </td>
                      <td className="shift-value">
                        {minuteText(department.shiftStartMinute)} to{" "}
                        {minuteText(department.shiftEndMinute)}
                      </td>
                      <td>{resourceCount}</td>
                      <td>{interruptionCount}</td>
                      <td>{statusLabel(department.isActive)}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="edit-button"
                            onClick={() => editRecord("department", department)}
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            className="edit-button"
                            onClick={() => copyDepartment(department)}
                            type="button"
                            aria-label={`Copy ${department.departmentName} as a template`}
                          >
                            Copy
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="empty-state" colSpan="9">
                    No departments match this view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      <footer className="table-footer">
        <span>{detail.title}</span>
        <span>Changes save to the Fabric configuration</span>
      </footer>

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
            aria-labelledby="config-editor-title"
          >
            <form onSubmit={saveRecord}>
              <header className="drawer-header">
                <div>
                  <span className="eyebrow">
                    {editor[
                      editor.kind === "organization"
                        ? "orgID"
                        : editor.kind === "masterDepartment"
                          ? "masterDepartmentID"
                          : "departmentID"
                    ]
                      ? "CONFIGURATION RECORD"
                      : "NEW RECORD"}
                  </span>
                  <h2 id="config-editor-title">
                    {editor[
                      editor.kind === "organization"
                        ? "orgID"
                        : editor.kind === "masterDepartment"
                          ? "masterDepartmentID"
                          : "departmentID"
                    ]
                      ? `Edit ${editor.kind === "organization" ? "organization" : editor.kind === "masterDepartment" ? "master department" : "department"}`
                      : detail.action}
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
                {editor.kind === "organization" && (
                  <div className="form-grid">
                    <label className="field">
                      <span>
                        Organization code <b>*</b>
                      </span>
                      <input
                        required
                        maxLength="20"
                        readOnly={Boolean(editor.orgID)}
                        value={editor.orgCode}
                        onChange={(event) =>
                          setField("orgCode", event.target.value)
                        }
                      />
                      {editor.orgID && (
                        <small>
                          Organization codes cannot be changed after creation.
                        </small>
                      )}
                    </label>
                    <label className="field">
                      <span>
                        Organization name <b>*</b>
                      </span>
                      <input
                        required
                        maxLength="200"
                        value={editor.orgName}
                        onChange={(event) =>
                          setField("orgName", event.target.value)
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Display order</span>
                      <input
                        type="number"
                        value={editor.displayOrder}
                        onChange={(event) =>
                          setField("displayOrder", event.target.value)
                        }
                      />
                    </label>
                  </div>
                )}
                {editor.kind === "masterDepartment" && (
                  <div className="form-grid">
                    <label className="field">
                      <span>Organization</span>
                      <input value={orgCode} readOnly />
                    </label>
                    <label className="field">
                      <span>
                        Code <b>*</b>
                      </span>
                      <input
                        required
                        maxLength="50"
                        value={editor.masterDepartmentCode}
                        onChange={(event) =>
                          setField("masterDepartmentCode", event.target.value)
                        }
                      />
                    </label>
                    <label className="field span-two">
                      <span>
                        Name <b>*</b>
                      </span>
                      <input
                        required
                        maxLength="200"
                        value={editor.masterDepartmentName}
                        onChange={(event) =>
                          setField("masterDepartmentName", event.target.value)
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Display order</span>
                      <input
                        type="number"
                        value={editor.displayOrder}
                        onChange={(event) =>
                          setField("displayOrder", event.target.value)
                        }
                      />
                    </label>
                  </div>
                )}
                {editor.kind === "department" && (
                  <>
                    <div className="form-grid">
                      <label className="field">
                        <span>
                          Department name <b>*</b>
                        </span>
                        <input
                          required
                          maxLength="200"
                          value={editor.departmentName}
                          onChange={(event) =>
                            setField("departmentName", event.target.value)
                          }
                        />
                      </label>
                      <label className="field">
                        <span>
                          Department code <b>*</b>
                        </span>
                        <input
                          required
                          maxLength="50"
                          value={editor.departmentCode}
                          onChange={(event) =>
                            setField("departmentCode", event.target.value)
                          }
                        />
                      </label>
                      <label className="field span-two">
                        <span>
                          Master department <b>*</b>
                        </span>
                        <select
                          required
                          value={editor.masterDepartmentID}
                          onChange={(event) =>
                            setField("masterDepartmentID", event.target.value)
                          }
                        >
                          <option value="">Select a master department</option>
                          {masters
                            .filter(
                              (item) =>
                                item.isActive ||
                                item.masterDepartmentID ===
                                  editor.masterDepartmentID,
                            )
                            .map((item) => (
                              <option
                                key={item.masterDepartmentID}
                                value={item.masterDepartmentID}
                              >
                                {item.masterDepartmentName}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Efficiency</span>
                        <div className="input-suffix">
                          <input
                            type="number"
                            min="0.1"
                            step="0.1"
                            value={editor.efficiencyPercent}
                            onChange={(event) =>
                              setField("efficiencyPercent", event.target.value)
                            }
                          />
                          <span>%</span>
                        </div>
                      </label>
                      <label className="field">
                        <span>Display order</span>
                        <input
                          type="number"
                          value={editor.displayOrder}
                          onChange={(event) =>
                            setField("displayOrder", event.target.value)
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Shift start</span>
                        <input
                          type="time"
                          required
                          value={editor.shiftStartTime || ""}
                          onChange={(event) =>
                            setField("shiftStartTime", event.target.value)
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Shift end</span>
                        <input
                          type="time"
                          required
                          value={editor.shiftEndTime || ""}
                          onChange={(event) =>
                            setField("shiftEndTime", event.target.value)
                          }
                        />
                      </label>
                    </div>
                    {editor.departmentID && (
                      <section className="assignment-section">
                        <div className="assignment-heading">
                          <div>
                            <h3>Assigned resources</h3>
                            <p>
                              Link a resource already used by another
                              department.
                            </p>
                          </div>
                        </div>
                        <div className="link-resource-controls">
                          {linkableResources.length > 0 ? (
                            <>
                              <label className="field">
                                <span>Existing resource</span>
                                <select
                                  value={resourceToLink}
                                  onChange={(event) =>
                                    setResourceToLink(event.target.value)
                                  }
                                >
                                  <option value="">Select a resource</option>
                                  {linkableResources.map((resource) => (
                                    <option
                                      key={resource.resourceID}
                                      value={resource.resourceID}
                                    >
                                      {resource.resourceName} (
                                      {resource.resourceCode})
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <button
                                className="edit-button"
                                type="button"
                                disabled={!resourceToLink || saving}
                                onClick={linkExistingResource}
                              >
                                {saving ? "Linking..." : "Link resource"}
                              </button>
                            </>
                          ) : (
                            <p className="no-departments">
                              No unassigned active resources are available to
                              link.
                            </p>
                          )}
                        </div>
                        {linkedResources.length > 0 && (
                          <div className="interruption-list linked-resource-list">
                            {linkedResources.map((resource) => (
                              <div
                                className="interruption-row"
                                key={resource.resourceID}
                              >
                                <span>
                                  <strong>{resource.resourceName}</strong>
                                  <small>{resource.resourceCode}</small>
                                </span>
                                <span className="type-label">
                                  {resource.resourceType}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>
                    )}
                    {editor.departmentID && (
                      <section className="assignment-section">
                        <div className="assignment-heading">
                          <div>
                            <h3>Interruptions</h3>
                            <p>Department-owned breaks and unavailable time.</p>
                          </div>
                          <button
                            className="edit-button"
                            type="button"
                            onClick={() => openInterruption()}
                          >
                            Add interruption
                          </button>
                        </div>
                        <div className="interruption-list">
                          {interruptions
                            .filter(
                              (item) =>
                                item.departmentID === editor.departmentID,
                            )
                            .map((item) => (
                              <div
                                className="interruption-row"
                                key={item.departmentInterruptionID}
                              >
                                <span>
                                  <strong>{item.interruptionName}</strong>
                                  <small>
                                    {item.interruptionType} /{" "}
                                    {minuteText(item.startMinute)}-
                                    {minuteText(item.endMinute)}
                                  </small>
                                </span>
                                {statusLabel(item.isActive)}
                                <button
                                  className="edit-button"
                                  type="button"
                                  onClick={() => openInterruption(item)}
                                >
                                  Edit
                                </button>
                              </div>
                            ))}
                          {!interruptions.some(
                            (item) => item.departmentID === editor.departmentID,
                          ) && (
                            <p className="no-departments">
                              No interruptions configured.
                            </p>
                          )}
                        </div>
                      </section>
                    )}
                  </>
                )}
                <label className="active-toggle">
                  <span>
                    <strong>Active</strong>
                    <small>
                      Inactive records remain in setup and can be re-enabled.
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    checked={editor.isActive}
                    onChange={(event) =>
                      setField("isActive", event.target.checked)
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
                <button
                  className="primary-button"
                  type="submit"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </footer>
            </form>
          </aside>
        </div>
      )}

      {interruptionEditor && (
        <div className="drawer-backdrop nested-backdrop" role="presentation">
          <aside
            className="drawer narrow-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="interruption-title"
          >
            <form onSubmit={saveInterruption}>
              <header className="drawer-header">
                <div>
                  <span className="eyebrow">DEPARTMENT INTERRUPTION</span>
                  <h2 id="interruption-title">
                    {interruptionEditor.departmentInterruptionID
                      ? "Edit interruption"
                      : "Add interruption"}
                  </h2>
                </div>
                <button
                  className="close-button"
                  type="button"
                  onClick={() => setInterruptionEditor(null)}
                  aria-label="Close editor"
                >
                  x
                </button>
              </header>
              <div className="drawer-content">
                <div className="form-grid">
                  <label className="field">
                    <span>
                      Name <b>*</b>
                    </span>
                    <input
                      required
                      maxLength="200"
                      value={interruptionEditor.interruptionName}
                      onChange={(event) =>
                        setInterruptionEditor((current) => ({
                          ...current,
                          interruptionName: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>
                      Type <b>*</b>
                    </span>
                    <input
                      required
                      maxLength="50"
                      value={interruptionEditor.interruptionType}
                      onChange={(event) =>
                        setInterruptionEditor((current) => ({
                          ...current,
                          interruptionType: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>
                      Start <b>*</b>
                    </span>
                    <input
                      type="time"
                      required
                      value={interruptionEditor.startTime}
                      onChange={(event) =>
                        setInterruptionEditor((current) => ({
                          ...current,
                          startTime: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>
                      End <b>*</b>
                    </span>
                    <input
                      type="time"
                      required
                      value={interruptionEditor.endTime}
                      onChange={(event) =>
                        setInterruptionEditor((current) => ({
                          ...current,
                          endTime: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Display order</span>
                    <input
                      type="number"
                      value={interruptionEditor.displayOrder}
                      onChange={(event) =>
                        setInterruptionEditor((current) => ({
                          ...current,
                          displayOrder: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
                <label className="active-toggle">
                  <span>
                    <strong>Active</strong>
                    <small>
                      Inactive interruptions are ignored by dispatch.
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    checked={interruptionEditor.isActive}
                    onChange={(event) =>
                      setInterruptionEditor((current) => ({
                        ...current,
                        isActive: event.target.checked,
                      }))
                    }
                  />
                  <i />
                </label>
              </div>
              <footer className="drawer-footer">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setInterruptionEditor(null)}
                >
                  Cancel
                </button>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save interruption"}
                </button>
              </footer>
            </form>
          </aside>
        </div>
      )}
    </>
  );
}
