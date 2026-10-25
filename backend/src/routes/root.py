from fastapi import APIRouter

from src.routes.appointment import router as appointment_router
from src.routes.booking import router as booking_router
from src.routes.care_plan import router as care_plan_router
from src.routes.lab_result import router as lab_result_router
from src.routes.notification import router as notification_router
from src.routes.patient import router as patient_router
from src.routes.prescription import router as prescription_router
from src.routes.doctor import router as doctor_router
from src.routes.auth import router as auth_router
from src.routes.ingest import router as ingest_router
from src.routes.chatbot import router as chatbot_router

router = APIRouter()


router.include_router(
    auth_router,
    prefix="/auth",
    tags=["auth"],
)

# Booking is mounted before `appointment_router` on purpose: its static
# `/appointments/bookable-doctors` must win over `/appointments/{appointment_id}`.
router.include_router(
    booking_router,
    prefix="/appointments",
    tags=["appointments"],
)

router.include_router(
    appointment_router,
    prefix="/appointments",
    tags=["appointments"],
)

router.include_router(
    patient_router,
    prefix="/patients",
    tags=["patients"],
)

router.include_router(
    doctor_router,
    prefix="/doctors",
    tags=["doctors"],
)

router.include_router(
    ingest_router,
    prefix="/ingest",
    tags=["ingest"],
)

router.include_router(
    chatbot_router,
    prefix="/chatbot",
    tags=["chatbot"],
)

router.include_router(
    care_plan_router,
    prefix="/care-plan",
    tags=["care-plan"],
)

router.include_router(
    lab_result_router,
    prefix="/lab-results",
    tags=["lab-results"],
)

router.include_router(
    notification_router,
    prefix="/notifications",
    tags=["notifications"],
)

router.include_router(
    prescription_router,
    prefix="/prescriptions",
    tags=["prescriptions"],
)

