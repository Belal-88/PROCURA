const PORT = 4000;
const BASE_URL = `http://127.0.0.1:${PORT}/api/v1`;

async function runTests() {
  console.log('🧪 Starting PROCURA Backend Integration Tests against live server...\n');

  // 1. Health check
  console.log('1. Checking Health Check...');
  const healthRes = await fetch(`http://127.0.0.1:${PORT}/health`);
  const healthJson = await healthRes.json();
  if (healthRes.status !== 200 || healthJson.status !== 'healthy') {
    throw new Error(`Health check failed: ${JSON.stringify(healthJson)}`);
  }
  console.log('   ✅ Health check passed!\n');

  // 2. Auth: Login as seeded accounts
  console.log('2. Authenticating as Requester, Officer, Manager, and Tech Supplier...');
  
  // Requester
  const reqLogin = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'belal.khalil@procura.io', password: 'password123' })
  });
  const reqData = await reqLogin.json();
  const requesterToken = reqData.token;
  console.log('   ✅ Requester login passed:', reqData.user.name, `(${reqData.user.role})`);

  // Officer
  const offLogin = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'mona.officer@procura.io', password: 'password123' })
  });
  const offData = await offLogin.json();
  const officerToken = offData.token;
  console.log('   ✅ Officer login passed:', offData.user.name, `(${offData.user.role})`);

  // Manager
  const mgrLogin = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'youssef.vp@procura.io', password: 'password123' })
  });
  const mgrData = await mgrLogin.json();
  const managerToken = mgrData.token;
  console.log('   ✅ Manager login passed:', mgrData.user.name, `(${mgrData.user.role})`);

  // Tech Supplier
  const supLogin = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'quotes@techsupply.io', password: 'password123' })
  });
  const supData = await supLogin.json();
  const techSupplierToken = supData.token;
  console.log('   ✅ Tech Supplier login passed:', supData.user.companyName, `(${supData.user.role})\n`);

  // 3. New Feature: Register New Account with Gmail & Stakeholder Radio (Furniture Supplier)
  console.log('3. Testing New Account Creation with Gmail & Supplier Category Selection (Furniture Supplier)...');
  const uniqueGmail = `furniture.vendor.${Date.now()}@gmail.com`;
  const regSupRes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Nabil Ergonomics',
      email: uniqueGmail,
      password: 'password123',
      role: 'supplier',
      supplierCategory: 'furniture',
      companyName: 'Nabil Premium Office Furnishings Co.'
    })
  });
  const regSupData = await regSupRes.json();
  if (regSupRes.status !== 201 || !regSupData.token || regSupData.user.supplierCategory !== 'furniture') {
    throw new Error(`Failed to register furniture supplier: ${JSON.stringify(regSupData)}`);
  }
  const furnitureSupplierToken = regSupData.token;
  console.log('   ✅ Registered new Furniture Supplier with Gmail:', regSupData.user.name, `(Company: ${regSupData.user.companyName}, Category: ${regSupData.user.supplierCategory})\n`);

  // 4. New Feature: Register New Account with Gmail (Requester)
  console.log('4. Testing New Account Creation with Gmail (Requester)...');
  const uniqueReqGmail = `requester.${Date.now()}@gmail.com`;
  const regReqRes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Sarah Connor',
      email: uniqueReqGmail,
      password: 'password123',
      role: 'requester'
    })
  });
  const regReqData = await regReqRes.json();
  if (regReqRes.status !== 201 || !regReqData.token || regReqData.user.role !== 'requester') {
    throw new Error(`Failed to register requester: ${JSON.stringify(regReqData)}`);
  }
  console.log('   ✅ Registered new Requester with Gmail:', regReqData.user.name, `(${regReqData.user.role})\n`);

  // 5. New Feature: Create Tech Request & Verify Auto-Dispatch to Tech Suppliers ONLY
  console.log('5. Testing Tech Request Creation & Auto-Dispatch to Tech Suppliers ONLY...');
  const createTechRes = await fetch(`${BASE_URL}/requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${requesterToken}`
    },
    body: JSON.stringify({
      title: 'Ultra-Wide Curved Monitors & Wireless Mice Batch',
      category: 'tech',
      description: '25 4K dual-input monitors and ergonomic wireless mice.',
      quantity: 25,
      estimatedBudget: 14500,
      reason: 'Engineering developer cluster upgrade.',
      deliveryDate: '2026-12-28',
      status: 'Submitted'
    })
  });
  const createdTechReq = await createTechRes.json();
  if (createTechRes.status !== 201 || !createdTechReq.id) {
    throw new Error(`Failed to create tech request: ${JSON.stringify(createdTechReq)}`);
  }
  // Verify that all auto-invited suppliers are Tech suppliers
  const suppliersRes = await fetch(`${BASE_URL}/suppliers`, {
    headers: { Authorization: `Bearer ${officerToken}` }
  });
  const allSuppliers = await suppliersRes.json();
  const techSupplierIds = allSuppliers.filter((s: any) => (s.category || '').toLowerCase().includes('tech')).map((s: any) => s.id);
  const invitedAreAllTech = createdTechReq.invitedSupplierIds.every((id: string) => techSupplierIds.includes(id));
  if (!invitedAreAllTech || createdTechReq.invitedSupplierIds.length === 0) {
    throw new Error(`Tech request auto-dispatch failed! Invited: ${JSON.stringify(createdTechReq.invitedSupplierIds)}`);
  }
  console.log(`   ✅ Tech Request ${createdTechReq.id} created! Auto-invited Tech Suppliers: [${createdTechReq.invitedSupplierIds.join(', ')}]\n`);

  // 6. New Feature: Create Furniture Request & Verify Auto-Dispatch to Furniture Suppliers ONLY
  console.log('6. Testing Furniture Request Creation & Auto-Dispatch to Furniture Suppliers ONLY...');
  const createFurnRes = await fetch(`${BASE_URL}/requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${requesterToken}`
    },
    body: JSON.stringify({
      title: 'Executive Conference Room Tables & Mesh Chairs',
      category: 'furniture',
      description: '4 solid oak meeting tables and 24 breathable ergonomic mesh armchairs.',
      quantity: 28,
      estimatedBudget: 19800,
      reason: 'Boardroom and innovation lounge renovation.',
      deliveryDate: '2027-01-15',
      status: 'Submitted'
    })
  });
  const createdFurnReq = await createFurnRes.json();
  if (createFurnRes.status !== 201 || !createdFurnReq.id) {
    throw new Error(`Failed to create furniture request: ${JSON.stringify(createdFurnReq)}`);
  }
  const furnSupplierIds = allSuppliers.filter((s: any) => (s.category || '').toLowerCase().includes('furniture')).map((s: any) => s.id);
  const invitedAreAllFurniture = createdFurnReq.invitedSupplierIds.every((id: string) => furnSupplierIds.includes(id));
  if (!invitedAreAllFurniture || createdFurnReq.invitedSupplierIds.length === 0) {
    throw new Error(`Furniture request auto-dispatch failed! Invited: ${JSON.stringify(createdFurnReq.invitedSupplierIds)}`);
  }
  console.log(`   ✅ Furniture Request ${createdFurnReq.id} created! Auto-invited Furniture Suppliers: [${createdFurnReq.invitedSupplierIds.join(', ')}]\n`);

  // 7. Test PDF Upload & Gemini AI Extraction on Furniture Request
  console.log('7. Testing Furniture Supplier Quotation Upload & AI Extraction...');
  const pdfContent = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n0000000053 00000 n\n0000000102 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF';
  const formData = new FormData();
  formData.append('requestId', createdFurnReq.id);
  formData.append('supplierId', regSupData.user.supplierId);
  const blob = new Blob([pdfContent], { type: 'application/pdf' });
  formData.append('file', blob, 'Nabil_Executive_Furniture_Proposal.pdf');

  const uploadRes = await fetch(`${BASE_URL}/quotations/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${furnitureSupplierToken}`
    },
    body: formData
  });
  const uploadedOffer = await uploadRes.json();
  if (uploadRes.status !== 201 || !uploadedOffer.id) {
    throw new Error(`Quotation upload failed: ${JSON.stringify(uploadedOffer)}`);
  }
  console.log(`   ✅ Furniture quotation uploaded: ${uploadedOffer.id} (Supplier: ${uploadedOffer.supplierName}, Status: ${uploadedOffer.extractionStatus})\n`);

  // 8. Officer Verifies AI Extraction
  console.log('8. Officer Verifying AI Extraction...');
  const verifyRes = await fetch(`${BASE_URL}/quotations/${uploadedOffer.id}/verify`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${officerToken}`
    },
    body: JSON.stringify({
      supplierName: regSupData.user.companyName,
      totalPrice: 18900,
      currency: 'USD',
      deliveryDays: 14,
      paymentTerms: 'Net 30',
      warrantyMonths: 60,
      notes: '5-year executive warranty on frame and hydraulic components.'
    })
  });
  const verifiedOffer = await verifyRes.json();
  if (!verifiedOffer.reviewed || verifiedOffer.totalPrice !== 18900) {
    throw new Error(`Verification failed: ${JSON.stringify(verifiedOffer)}`);
  }
  console.log(`   ✅ Offer ${uploadedOffer.id} verified and approved by Officer.\n`);

  // 9. Officer sends for Approval -> Manager Approves
  console.log('9. Officer Sending for Approval & Manager Approving...');
  await fetch(`${BASE_URL}/requests/${createdFurnReq.id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${officerToken}`
    },
    body: JSON.stringify({ status: 'PendingApproval' })
  });

  const approveRes = await fetch(`${BASE_URL}/requests/${createdFurnReq.id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${managerToken}`
    },
    body: JSON.stringify({ status: 'Approved' })
  });
  const approvedReq = await approveRes.json();
  if (approvedReq.status !== 'Approved') {
    throw new Error(`Approval failed: ${JSON.stringify(approvedReq)}`);
  }
  console.log(`   ✅ Request ${createdFurnReq.id} successfully approved by Manager!\n`);

  // 10. Audit Logs Check
  console.log('10. Checking System Audit Logs...');
  const auditRes = await fetch(`${BASE_URL}/audit-logs`, {
    headers: { Authorization: `Bearer ${officerToken}` }
  });
  const auditLogs = await auditRes.json();
  console.log(`   ✅ Audit log recorded ${auditLogs.length} total events.`);
  console.log(`      Latest action: "${auditLogs[0].action}" by ${auditLogs[0].user} at ${auditLogs[0].timestamp}\n`);

  console.log('🎉 ALL INTEGRATION TESTS (GMAIL REGISTRATION, STAKEHOLDERS, TECH/FURNITURE AUTO-DISPATCH) PASSED! 🎉');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('❌ Test suite error:', err);
  process.exit(1);
});
