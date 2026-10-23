"""List the demo accounts that exist in the local Mongo, so we know the login path."""
import asyncio
import sys

sys.path.insert(0, ".")

from src import db  # noqa: E402


async def main() -> None:
    print("db:", db.db.name, "| configured:", db.MONGO_CONFIGURED)
    names = await db.db.list_collection_names()
    for name in names:
        try:
            count = await db.db[name].count_documents({})
        except Exception:
            count = "?"
        print(f"  {name:<28} {count}")

    print("\nusers:")
    async for user in db.db.users.find({}, {"email": 1, "role": 1, "name": 1, "full_name": 1, "user_type": 1}).limit(15):
        print("  ", {k: v for k, v in user.items() if k != "_id"})

    print("\ndoctor profiles:")
    async for prof in db.db.doctors.find({}, {"email": 1, "name": 1, "specialization": 1}).limit(10):
        print("  ", {k: v for k, v in prof.items() if k != "_id"})


asyncio.run(main())
